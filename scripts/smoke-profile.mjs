import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RssAdapter } from "../dist-test/src/adapters/rss.js";
import { parseProfile } from "../dist-test/src/profile.js";

const profileArg = process.argv[2];
const requiredArg = process.argv[3];
if (!profileArg || !requiredArg) {
  throw new Error("usage: node scripts/smoke-profile.mjs <profile-path> <minimum-healthy-sources>");
}

const profilePath = resolve(profileArg);
const profile = parseProfile(JSON.parse(await readFile(profilePath, "utf8")));
const sources = profile.sources.filter((source) => source.enabled);
const minimumHealthy = Number.parseInt(requiredArg, 10);
const maxAgeDays = 14;
const timeoutMs = 20_000;
let healthy = 0;

for (const source of sources) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const context = {
    signal: controller.signal,
    now: () => new Date().toISOString(),
    request: async (url, headers = {}) => {
      const response = await fetch(url, {
        headers: { "User-Agent": "Trending-Radar-Profile-Smoke/0.1", ...headers },
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
    const result = await new RssAdapter().fetch(source, context);
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
    const fresh = ageDays <= maxAgeDays;
    if (fresh) healthy += 1;
    process.stdout.write(`${source.sourceId}: ok items=${result.items.length} dropped=${result.droppedCount} latest=${latest} fresh=${fresh}\n`);
  } finally {
    clearTimeout(timeout);
  }
}

process.stdout.write(`summary: profile=${profile.profileId} healthy=${healthy}/${sources.length} required=${minimumHealthy} maxAgeDays=${maxAgeDays}\n`);
if (healthy < minimumHealthy) process.exitCode = 1;
