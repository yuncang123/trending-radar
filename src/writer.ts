import type { DraftInput, NormalizedItem, SourceFailure, WriterOutput } from "./types.js";

const DEFAULT_MAX_ITEMS = 50;

function filterNumber(filter: Record<string, unknown>, key: string, fallback: number): number {
  const value = filter[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function requireTopicMatch(filter: Record<string, unknown>): boolean {
  return filter.requireTopicMatch === true;
}

function topicScore(item: NormalizedItem, topics: string[]): number {
  if (topics.length === 0) return 0;
  const haystack = `${item.title} ${item.excerpt} ${item.sourceId}`.toLowerCase();
  return topics.reduce((score, topic) => score + (haystack.includes(topic.toLowerCase()) ? 1 : 0), 0);
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function publishedTime(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareItems(a: NormalizedItem, b: NormalizedItem, topics: string[]): number {
  const scoreDelta = topicScore(b, topics) - topicScore(a, topics);
  if (scoreDelta !== 0) return scoreDelta;
  const dateDelta = publishedTime(b.publishedAt) - publishedTime(a.publishedAt);
  if (dateDelta !== 0) return dateDelta;
  const sourceDelta = compareText(a.sourceId, b.sourceId);
  if (sourceDelta !== 0) return sourceDelta;
  const titleDelta = compareText(a.title, b.title);
  if (titleDelta !== 0) return titleDelta;
  return compareText(a.url, b.url);
}

export function selectTrendItems(items: NormalizedItem[], topics: string[], filter: Record<string, unknown>): { items: NormalizedItem[]; selection: DraftInput["selection"] } {
  const maxItems = filterNumber(filter, "maxItems", DEFAULT_MAX_ITEMS);
  const mustMatch = requireTopicMatch(filter);
  const candidates = mustMatch && topics.length > 0 ? items.filter((item) => topicScore(item, topics) > 0) : items;
  const selected = [...candidates].sort((a, b) => compareItems(a, b, topics)).slice(0, maxItems);
  return { items: selected, selection: { candidateCount: items.length, selectedCount: selected.length, maxItems, requireTopicMatch: mustMatch } };
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

function itemBlock(item: NormalizedItem, index: number): string {
  const published = item.publishedAt ? safeText(item.publishedAt) : "unknown";
  const verification = `reachable=${item.verification.reachable}; status=${item.verification.status ?? "unknown"}; checked=${safeText(item.verification.checkedAt)}`;
  return [
    `### ${index}. ${safeText(item.title)}`,
    `- Link: <${item.url}>`,
    `- Source: \`${safeText(item.sourceId)}\``,
    `- Published: ${published}`,
    `- Excerpt: ${safeText(item.excerpt) || "(none)"}`,
    `- Verification: ${verification}`,
    ""
  ].join("\n");
}

export function renderTemplateDraft(input: DraftInput): WriterOutput {
  const date = input.generatedAt.slice(0, 10);
  const title = `Trending Radar ${date}`;
  const failures = input.failures.length > 0 ? input.failures.map(failureLine).join("\n") : "- None";
  const items = input.items.length > 0 ? input.items.map(itemBlock).join("\n") : "No usable items were selected. Check source failures, topics, and filter settings.\n";
  const markdown = [
    `# ${title}`,
    "",
    "## Run status",
    `- Status: \`${input.status}\``,
    `- Run: \`${input.runId}\``,
    `- Profile: \`${input.profileId}\` / \`${input.profileVersion}\``,
    `- Candidates: ${input.selection.candidateCount}; selected: ${input.selection.selectedCount}; maxItems: ${input.selection.maxItems}`,
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

/** Keep the provider's prose readable while restoring a compact, deterministic fact ledger. */
export function appendFactAppendix(input: DraftInput, markdown: string): string {
  const lines = [
    "## Verified source facts",
    `- Run: ${input.runId}`,
    `- Status: ${input.status}`,
    `- Profile: ${input.profileId} / ${input.profileVersion}`,
    `- Candidates: ${input.selection.candidateCount}; selected: ${input.selection.selectedCount}`,
    `- Topics: ${input.topics.length > 0 ? input.topics.map(safeText).join(", ") : "none"}`,
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
