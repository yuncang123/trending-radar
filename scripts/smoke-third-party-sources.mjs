import { readFile } from "node:fs/promises";
import { RssAdapter } from "../dist-test/src/adapters/rss.js";
import { parseProfile } from "../dist-test/src/profile.js";

const PROFILE_PATH = new URL("../profiles/chinese-third-party-v1.json", import.meta.url);
const MIN_HEALTHY_SOURCES = 1;
const MAX_AGE_DAYS = 14;
const REQUEST_TIMEOUT_MS = 20_000;

const profile = parseProfile(JSON.parse(await readFile(PROFILE_PATH, "utf8")));
const enabledSources = profile.sources.filter((source) => source.enabled);
const disabledSources = profile.sources.filter((source) => !source.enabled);
let healthy = 0;

for (const source of disabledSources) {
  process.stdout.write(`${source.sourceId}: skipped enabled=false kind=${source.kind}\n`);
}

for (const source of enabledSources) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const context = {
    signal: controller.signal,
    now: () => new Date().toISOString(),
    request: async (url, headers = {}) => {
      const response = await fetch(url, {
        headers: { "User-Agent": "Trending-Radar-Third-Party-Smoke/0.1", ...headers },
        signal: controller.signal
      });
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        text: await response.text()
      };
    }
  };

  try {
    const adapter = new RssAdapter(source.kind === "rsshub-compatible" ? "rsshub-compatible" : "rss");
    const result = await adapter.fetch(source, context);
    if (!result.ok) {
      process.stdout.write(`${source.sourceId}: ${result.code} stage=${result.stage} retryable=${result.retryable}\n`);
      continue;
    }

    const timestamps = result.items
      .map((item) => item.publishedAt ? Date.parse(item.publishedAt) : Number.NaN)
      .filter(Number.isFinite);
    const latestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : Number.NaN;
    const latest = Number.isFinite(latestTimestamp) ? new Date(latestTimestamp).toISOString() : "unknown";
    const ageDays = Number.isFinite(latestTimestamp)
      ? Math.floor((Date.now() - latestTimestamp) / 86_400_000)
      : Number.POSITIVE_INFINITY;
    const fresh = ageDays <= MAX_AGE_DAYS;
    if (fresh) healthy += 1;
    process.stdout.write(`${source.sourceId}: ok items=${result.items.length} dropped=${result.droppedCount} latest=${latest} fresh=${fresh}\n`);
  } finally {
    clearTimeout(timeout);
  }
}

process.stdout.write(`summary: healthy=${healthy}/${enabledSources.length} required=${MIN_HEALTHY_SOURCES} skipped=${disabledSources.length} maxAgeDays=${MAX_AGE_DAYS}\n`);
if (healthy < MIN_HEALTHY_SOURCES) process.exitCode = 1;
