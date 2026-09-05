import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { createAdapterRegistry } from "../dist-test/src/adapters/index.js";
import { deduplicateItems, isLowQualityExcerpt } from "../dist-test/src/normalize.js";
import { parseProfile } from "../dist-test/src/profile.js";
import { createDraftInput, renderTemplateDraft } from "../dist-test/src/writer.js";

const profile = parseProfile(JSON.parse(await readFile(new URL("../profiles/broad-trending-v2.json", import.meta.url), "utf8")));
const adapters = createAdapterRegistry();
const failures = [];
let items = [];
let healthy = 0;

for (const source of profile.sources.filter((entry) => entry.enabled)) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const context = {
    signal: controller.signal,
    now: () => new Date().toISOString(),
    parseHtml: (html) => parseHTML(html).document,
    request: async (url, headers = {}) => {
      const response = await fetch(url, {
        headers: { "User-Agent": "Trending-Radar-Broad-Smoke/0.1", ...headers },
        signal: controller.signal
      });
      return { status: response.status, headers: Object.fromEntries(response.headers.entries()), text: await response.text() };
    }
  };

  try {
    const adapter = adapters.get(source.kind);
    const result = adapter
      ? await adapter.fetch(source, context)
      : { ok: false, sourceId: source.sourceId, stage: "verify", code: "UNAVAILABLE", message: "Adapter unavailable", retryable: false, retrievedAt: context.now() };
    if (!result.ok) {
      failures.push(result);
      process.stdout.write(`${source.sourceId}: ${result.code} stage=${result.stage} retryable=${result.retryable}\n`);
      continue;
    }
    healthy += 1;
    items = deduplicateItems([...items, ...result.items]);
    process.stdout.write(`${source.sourceId}: ok items=${result.items.length} dropped=${result.droppedCount}\n`);
  } finally {
    clearTimeout(timeout);
  }
}

const generatedAt = new Date().toISOString();
const input = createDraftInput({
  runId: `broad-smoke-${generatedAt}`,
  profileId: profile.profileId,
  profileVersion: profile.version,
  status: failures.length === 0 ? "completed" : healthy > 0 ? "partial" : "failed",
  generatedAt,
  templateId: profile.templateId,
  topics: profile.topics,
  filter: profile.filter,
  items,
  failures
});
const output = renderTemplateDraft(input);
const sections = input.selection.sections ?? [];
const missingHeadings = sections.filter((section) => !output.markdown.includes(`### ${section.label}`));

process.stdout.write(`selection: candidates=${input.selection.candidateCount} selected=${input.selection.selectedCount} perSource=${input.selection.maxItemsPerSource ?? "none"}\n`);
const selectedLowQuality = input.items.filter((item) => isLowQualityExcerpt(item.excerpt)).length;
const selectedFuture = input.items.filter((item) => item.publishedAt && Date.parse(item.publishedAt) > Date.parse(input.generatedAt) + 5 * 60_000).length;
const selectedTopicless = input.items.filter((item) => !profile.topics.some((topic) => `${item.title} ${item.excerpt}`.toLowerCase().includes(topic.toLowerCase()))).length;
process.stdout.write(`quality: selectedLowQuality=${selectedLowQuality} selectedFuturePublishedAt=${selectedFuture} selectedTopicless=${selectedTopicless}\n`);
for (const section of sections) {
  process.stdout.write(`section: ${section.sectionId} selected=${section.selectedCount}\n`);
}
const enabledSourceCount = profile.sources.filter((source) => source.enabled).length;
const requiredHealthy = Math.max(10, Math.ceil(enabledSourceCount * 0.75));
process.stdout.write(`summary: healthy=${healthy}/${enabledSourceCount} required=${requiredHealthy} sections=${sections.length} missingHeadings=${missingHeadings.length}\n`);

if (healthy < requiredHealthy || sections.length < 5 || missingHeadings.length > 0 || input.selection.selectedCount === 0) process.exitCode = 1;
