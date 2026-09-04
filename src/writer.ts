import { isLowQualityExcerpt } from "./normalize.js";
import type { AiItemScore } from "./ai-ranking.js";
import type { DraftInput, DraftSectionSelection, FilterStats, NormalizedItem, SourceFailure, WriterOutput } from "./types.js";

const DEFAULT_MAX_ITEMS = 50;
const DEFAULT_MAX_AGE_HOURS = 24;

function filterNumber(filter: Record<string, unknown>, key: string, fallback: number): number {
  const value = filter[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function requireTopicMatch(filter: Record<string, unknown>): boolean {
  return filter.requireTopicMatch === true;
}

function maxAgeHours(filter: Record<string, unknown>): number {
  const value = filter.maxAgeHours;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_AGE_HOURS;
}

function requirePublishedAt(filter: Record<string, unknown>): boolean {
  return filter.requirePublishedAt !== false;
}

interface SectionConfig {
  sectionId: string;
  label: string;
  sourceIds: string[];
  maxItems: number;
  keywords?: string[];
  excludeKeywords?: string[];
}

function sectionConfigs(filter: Record<string, unknown>): SectionConfig[] {
  if (!Array.isArray(filter.sections)) return [];
  return filter.sections.flatMap((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const section = value as Record<string, unknown>;
    if (typeof section.sectionId !== "string" || typeof section.label !== "string" || !Array.isArray(section.sourceIds)) return [];
    const sourceIds = section.sourceIds.filter((sourceId): sourceId is string => typeof sourceId === "string");
    const maxItems = Number(section.maxItems);
    if (sourceIds.length === 0 || !Number.isInteger(maxItems) || maxItems <= 0) return [];
    const keywords = Array.isArray(section.keywords) ? section.keywords.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.toLowerCase()) : undefined;
    const excludeKeywords = Array.isArray(section.excludeKeywords) ? section.excludeKeywords.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.toLowerCase()) : undefined;
    return [{ sectionId: section.sectionId, label: section.label, sourceIds, maxItems, ...(keywords?.length ? { keywords } : {}), ...(excludeKeywords?.length ? { excludeKeywords } : {}) }];
  });
}

function itemText(item: NormalizedItem): string {
  return `${item.title} ${item.excerpt}`.toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textIncludesKeyword(text: string, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return false;
  const startsWithAsciiWord = /^[a-z0-9]/.test(normalized);
  const endsWithAsciiWord = /[a-z0-9]$/.test(normalized);
  if (!startsWithAsciiWord && !endsWithAsciiWord) return text.includes(normalized);
  const prefix = startsWithAsciiWord ? "(?:^|[^a-z0-9])" : "";
  const suffix = endsWithAsciiWord ? "(?![a-z0-9])" : "";
  return new RegExp(`${prefix}${escapeRegExp(normalized)}${suffix}`).test(text);
}

function topicScore(item: NormalizedItem, topics: string[]): number {
  if (topics.length === 0) return 0;
  const haystack = itemText(item);
  return topics.reduce((score, topic) => score + (textIncludesKeyword(haystack, topic) ? 1 : 0), 0);
}

function containsKeyword(item: NormalizedItem, keywords: string[] | undefined): boolean {
  const text = itemText(item);
  return Boolean(keywords?.some((keyword) => textIncludesKeyword(text, keyword)));
}

function matchesSection(item: NormalizedItem, section: SectionConfig): boolean {
  if (!section.sourceIds.includes(item.sourceId)) return false;
  if (containsKeyword(item, section.excludeKeywords)) return false;
  if (section.keywords?.length) return containsKeyword(item, section.keywords);
  return true;
}

function matchesSelectedSection(item: NormalizedItem, section: DraftSectionSelection): boolean {
  if (!section.sourceIds.includes(item.sourceId)) return false;
  if (containsKeyword(item, section.excludeKeywords)) return false;
  if (section.keywords?.length) return containsKeyword(item, section.keywords);
  return true;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function publishedTime(value: string | null, nowMs: number): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > nowMs + 5 * 60_000) return Number.NEGATIVE_INFINITY;
  return parsed;
}

function popularityScore(item: NormalizedItem): number {
  const signals = item.signals;
  if (!signals) return 0;
  return Math.log1p(signals.points ?? 0) +
    1.5 * Math.log1p(signals.stars ?? 0) +
    0.5 * Math.log1p(signals.forks ?? 0) +
    0.5 * Math.log1p(signals.comments ?? 0);
}

function compareItems(a: NormalizedItem, b: NormalizedItem, topics: string[], nowMs: number): number {
  const scoreDelta = topicScore(b, topics) - topicScore(a, topics);
  if (scoreDelta !== 0) return scoreDelta;
  const popularityDelta = popularityScore(b) - popularityScore(a);
  if (popularityDelta !== 0) return popularityDelta;
  const dateDelta = publishedTime(b.publishedAt, nowMs) - publishedTime(a.publishedAt, nowMs);
  if (dateDelta !== 0) return dateDelta;
  const sourceDelta = compareText(a.sourceId, b.sourceId);
  if (sourceDelta !== 0) return sourceDelta;
  const titleDelta = compareText(a.title, b.title);
  if (titleDelta !== 0) return titleDelta;
  return compareText(a.url, b.url);
}

export function selectTrendItems(items: NormalizedItem[], topics: string[], filter: Record<string, unknown>): { items: NormalizedItem[]; selection: DraftInput["selection"] } {
  const maxItems = filterNumber(filter, "maxItems", DEFAULT_MAX_ITEMS);
  const freshnessWindow = maxAgeHours(filter);
  const mustHavePublishedAt = requirePublishedAt(filter);
  const mustMatch = requireTopicMatch(filter);
  const retrievedTimes = items.map((item) => Date.parse(item.retrievedAt)).filter((value) => Number.isFinite(value));
  const nowMs = retrievedTimes.length > 0 ? Math.max(...retrievedTimes) : Date.now();
  const excludedKeywords = Array.isArray(filter.excludeKeywords) ? filter.excludeKeywords.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.toLowerCase()) : [];
  const qualityFiltered = items.filter((item) => filter.excludeLowQuality !== true || !isLowQualityExcerpt(item.excerpt));
  const dateFiltered = qualityFiltered.filter((item) => filter.rejectFuturePublishedAt !== true || publishedTime(item.publishedAt, nowMs) !== Number.NEGATIVE_INFINITY || !item.publishedAt);
  const freshnessFiltered = dateFiltered.filter((item) => {
    if (!item.publishedAt) return !mustHavePublishedAt;
    const published = publishedTime(item.publishedAt, nowMs);
    return published === Number.NEGATIVE_INFINITY || nowMs - published <= freshnessWindow * 60 * 60 * 1000;
  });
  const topicMatches = topics.length > 0 ? freshnessFiltered.filter((item) => topicScore(item, topics) > 0) : freshnessFiltered;
  const topicFiltered = mustMatch && topics.length > 0 ? topicMatches : freshnessFiltered;
  const candidates = topicFiltered.filter((item) => !excludedKeywords.some((keyword) => textIncludesKeyword(itemText(item), keyword)));
  const ranked = [...candidates].sort((a, b) => compareItems(a, b, topics, nowMs));
  const sections = sectionConfigs(filter);
  // Relevance is decided globally. Sections only organize the already selected
  // trends; their order, caps, exploration, and backfill flags never displace
  // a higher-ranked item from another section.
  const selected = ranked.slice(0, maxItems);
  const unknownPublishedAtCount = dateFiltered.filter((item) => !item.publishedAt).length;
  const staleDroppedCount = dateFiltered.filter((item) => {
    if (!item.publishedAt) return false;
    const published = publishedTime(item.publishedAt, nowMs);
    return published !== Number.NEGATIVE_INFINITY && nowMs - published > freshnessWindow * 60 * 60 * 1000;
  }).length;
  const filterStats: FilterStats = {
    maxAgeHours: freshnessWindow,
    requirePublishedAt: mustHavePublishedAt,
    collectedCount: items.length,
    qualityPassedCount: qualityFiltered.length,
    freshnessPassedCount: freshnessFiltered.length,
    topicMatchedCount: topicMatches.length,
    topicPassedCount: topicFiltered.length,
    exclusionPassedCount: candidates.length,
    effectiveCandidateCount: candidates.length,
    unknownPublishedAtCount,
    unknownPublishedAtDroppedCount: mustHavePublishedAt ? unknownPublishedAtCount : 0,
    staleDroppedCount
  };
  if (sections.length === 0) {
    return { items: selected, selection: { candidateCount: items.length, selectedCount: selected.length, maxItems, requireTopicMatch: mustMatch, filterStats } };
  }

  const sectionSelections: DraftSectionSelection[] = sections.map((section) => ({
    sectionId: section.sectionId,
    label: section.label,
    sourceIds: section.sourceIds,
    maxItems: section.maxItems,
    selectedCount: selected.filter((item) => matchesSection(item, section)).length,
    ...(section.keywords ? { keywords: section.keywords } : {}),
    ...(section.excludeKeywords ? { excludeKeywords: section.excludeKeywords } : {})
  }));
  const assignedItems = new Set(selected.filter((item) => sectionSelections.some((section) => matchesSelectedSection(item, section))));
  const unassigned = selected.filter((item) => !assignedItems.has(item));
  if (unassigned.length > 0) {
    sectionSelections.push({
      sectionId: "other",
      label: "Other",
      sourceIds: [...new Set(unassigned.map((item) => item.sourceId))].sort(compareText),
      maxItems: unassigned.length,
      selectedCount: unassigned.length
    });
  }

  return {
    items: selected,
    selection: {
      candidateCount: items.length,
      selectedCount: selected.length,
      maxItems,
      requireTopicMatch: mustMatch,
      filterStats,
      sections: sectionSelections
    }
  };
}

export function createDraftInput(args: {
  runId: string;
  profileId: string;
  profileVersion: string;
  status: DraftInput["status"];
  generatedAt: string;
  templateId: string;
  topics: string[];
  filter: Record<string, unknown>;
  items: NormalizedItem[];
  failures: SourceFailure[];
}): DraftInput {
  const selected = selectTrendItems(args.items, args.topics, args.filter);
  return { schemaVersion: "v1", runId: args.runId, profileId: args.profileId, profileVersion: args.profileVersion, status: args.status, generatedAt: args.generatedAt, templateId: args.templateId, topics: [...args.topics], selection: selected.selection, items: selected.items, failures: [...args.failures] };
}

function safeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function failureLine(failure: SourceFailure): string {
  const retry = failure.retryable ? "retryable" : "not-retryable";
  const fallback = failure.fallback ? `; fallback: ${safeText(failure.fallback)}` : "";
  return `- \`${safeText(failure.sourceId)}\` at \`${safeText(failure.stage)}\` (` +
    `\`${safeText(failure.code)}\`): ${safeText(failure.message)}; ${retry}${fallback}`;
}

function itemBlock(item: NormalizedItem, index: number, headingLevel = 3, aiScore?: AiItemScore): string {
  const published = item.publishedAt ? safeText(item.publishedAt) : "unknown";
  const verification = `reachable=${item.verification.reachable}; status=${item.verification.status ?? "unknown"}; checked=${safeText(item.verification.checkedAt)}`;
  const signals = item.signals ? Object.entries(item.signals).map(([key, value]) => `${key}=${value}`).join(", ") : "none";
  return [
    `${"#".repeat(headingLevel)} ${index}. ${safeText(item.title)}`,
    `- Link: <${item.url}>`,
    `- Source: \`${safeText(item.sourceId)}\``,
    `- Published: ${published}`,
    `- Popularity: ${signals}`,
    ...(aiScore ? [`- AI score: ${aiScore.score}/100 — ${safeText(aiScore.reason)}`] : []),
    `- Excerpt: ${safeText(item.excerpt) || "(none)"}`,
    `- Verification: ${verification}`,
    ""
  ].join("\n");
}

function renderSelectedItems(input: DraftInput, aiScores?: ReadonlyMap<string, AiItemScore>): string {
  const sections = input.selection.sections;
  if (!sections || sections.length === 0) {
    return input.items.length > 0
      ? input.items.map((item, index) => itemBlock(item, index + 1, 3, aiScores?.get(item.url))).join("\n")
      : "No usable items were selected. Check source failures, topics, and filter settings.\n";
  }

  let itemIndex = 1;
  const renderedItems = new Set<NormalizedItem>();
  const blocks = sections.map((section) => {
    const sectionItems = input.items.filter((item) => !renderedItems.has(item) && matchesSelectedSection(item, section));
    sectionItems.forEach((item) => renderedItems.add(item));
    const body = sectionItems.length > 0
      ? sectionItems.map((item) => itemBlock(item, itemIndex++, 4, aiScores?.get(item.url))).join("\n")
      : "- No items selected.\n";
    return [`### ${safeText(section.label)} (${sectionItems.length})`, "", body].join("\n");
  });
  if (renderedItems.size < input.items.length) {
    const remaining = input.items.filter((item) => !renderedItems.has(item));
    blocks.push(["### Other", "", remaining.map((item) => itemBlock(item, itemIndex++, 4, aiScores?.get(item.url))).join("\n")].join("\n"));
  }
  return blocks.join("\n");
}

export function renderTemplateDraft(input: DraftInput): WriterOutput {
  const date = input.generatedAt.slice(0, 10);
  const title = `Trending Radar ${date}`;
  const failures = input.failures.length > 0 ? input.failures.map(failureLine).join("\n") : "- None";
  const items = renderSelectedItems(input);
  const markdown = [
    `# ${title}`,
    "",
    "## Run status",
    `- Status: \`${input.status}\``,
    `- Run: \`${input.runId}\``,
    `- Profile: \`${input.profileId}\` / \`${input.profileVersion}\``,
    `- Candidates: ${input.selection.candidateCount}; selected: ${input.selection.selectedCount}; maxItems: ${input.selection.maxItems}`,
    ...(input.selection.filterStats ? [
      `- Effective candidates: ${input.selection.filterStats.effectiveCandidateCount}; after freshness: ${input.selection.filterStats.freshnessPassedCount}; topic matched: ${input.selection.filterStats.topicMatchedCount}; topic passed: ${input.selection.filterStats.topicPassedCount}; stale dropped: ${input.selection.filterStats.staleDroppedCount}; unknown published: ${input.selection.filterStats.unknownPublishedAtCount}; unknown dropped: ${input.selection.filterStats.unknownPublishedAtDroppedCount ?? 0}; max age: ${input.selection.filterStats.maxAgeHours}h`
    ] : []),
    `- Topics: ${input.topics.length > 0 ? input.topics.map((topic) => `\`${safeText(topic)}\``).join(", ") : "none"}`,
    "",
    "## Source failures",
    failures,
    "",
    "## Selected trends",
    items,
    ""
  ].join("\n");
  return { schemaVersion: "v1", title, markdown, writerId: "template", writerVersion: "v1", writerFallback: false };
}

export function createAiRankedDraftInput(input: DraftInput, items: readonly NormalizedItem[], maxItems: number): DraftInput {
  const selected = [...items];
  const sections = input.selection.sections?.map((section) => ({
    ...section,
    selectedCount: selected.filter((item) => matchesSelectedSection(item, section)).length
  }));
  return {
    ...input,
    selection: {
      ...input.selection,
      selectedCount: selected.length,
      maxItems,
      ...(sections ? { sections } : {})
    },
    items: selected
  };
}

export function renderAiRankedDraft(
  input: DraftInput,
  args: { model: string; minimumScore: number; candidateCount: number; scores: ReadonlyMap<string, AiItemScore> }
): WriterOutput {
  const date = input.generatedAt.slice(0, 10);
  const title = `Trending Radar ${date}`;
  const failures = input.failures.length > 0 ? input.failures.map(failureLine).join("\n") : "- None";
  const items = renderSelectedItems(input, args.scores);
  const markdown = [
    `# ${title}`,
    "",
    "## Run status",
    `- Status: \`${input.status}\``,
    `- Run: \`${input.runId}\``,
    `- Profile: \`${input.profileId}\` / \`${input.profileVersion}\``,
    `- AI ranking: model=${safeText(args.model)}; candidates=${args.candidateCount}; selected=${input.selection.selectedCount}; minimum score=${args.minimumScore}/100`,
    `- Topics: ${input.topics.length > 0 ? input.topics.map((topic) => `\`${safeText(topic)}\``).join(", ") : "none"}`,
    "",
    "## Source failures",
    failures,
    "",
    "## Selected trends",
    items,
    ""
  ].join("\n");
  return { schemaVersion: "v1", title, markdown, writerId: `provider-ranking:${args.model}`, writerVersion: "v1", writerFallback: false };
}

/** Keep the provider's prose readable while restoring a compact, deterministic fact ledger. */
export function appendFactAppendix(input: DraftInput, markdown: string): string {
  const lines = [
    "## Verified source facts",
    `- Run: ${input.runId}`,
    `- Status: ${input.status}`,
    `- Profile: ${input.profileId} / ${input.profileVersion}`,
    `- Candidates: ${input.selection.candidateCount}; selected: ${input.selection.selectedCount}`,
    ...(input.selection.filterStats ? [`- Filter stats: ${JSON.stringify(input.selection.filterStats)}`] : []),
    `- Topics: ${input.topics.length > 0 ? input.topics.map(safeText).join(", ") : "none"}`,
    ...(input.selection.sections ?? []).map((section) => `- Section: ${safeText(section.sectionId)} | ${safeText(section.label)} | selected=${section.selectedCount} | max=${section.maxItems}`),
    ...input.items.map((item) => `- Item: ${safeText(item.sourceId)} | ${safeText(item.title)} | ${item.url}`),
    ...input.failures.map((failure) => `- Failure: ${safeText(failure.sourceId)} | ${safeText(failure.stage)} | ${safeText(failure.code)}`)
  ];
  return `${markdown.trim()}\n\n${lines.join("\n")}\n`;
}

export type WriterValidation =
  | { ok: true; output: WriterOutput }
  | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Validate the machine output without allowing a writer to change source facts. */
export function validateExternalWriterOutput(input: DraftInput, candidate: unknown): WriterValidation {
  if (!isRecord(candidate)) return { ok: false, reason: "writer output must be a JSON object" };
  if (candidate.schemaVersion !== "v1") return { ok: false, reason: "writer output schemaVersion must be v1" };
  if (!requiredString(candidate.title)) return { ok: false, reason: "writer output title is required" };
  if (!requiredString(candidate.markdown)) return { ok: false, reason: "writer output markdown is required" };
  if (!requiredString(candidate.writerId) || !requiredString(candidate.writerVersion)) return { ok: false, reason: "writer output identity is required" };
  if (typeof candidate.writerFallback !== "boolean") return { ok: false, reason: "writerFallback must be boolean" };

  const markdown = candidate.markdown;
  const anchors = [
    input.runId,
    input.status,
    input.profileId,
    input.profileVersion,
    String(input.selection.candidateCount),
    String(input.selection.selectedCount),
    ...input.topics,
    ...(input.selection.sections ?? []).map((section) => section.label),
    ...input.items.flatMap((item) => [item.sourceId, item.title, item.url]),
    ...input.failures.flatMap((failure) => [failure.sourceId, failure.stage, failure.code])
  ];
  for (const anchor of anchors) {
    if (anchor && !markdown.includes(anchor)) return { ok: false, reason: `markdown is missing fact anchor: ${anchor}` };
  }

  return {
    ok: true,
    output: {
      schemaVersion: "v1",
      title: candidate.title,
      markdown: candidate.markdown,
      writerId: candidate.writerId,
      writerVersion: candidate.writerVersion,
      writerFallback: candidate.writerFallback
    }
  };
}
