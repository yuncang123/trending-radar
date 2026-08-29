import { parseHTML } from "linkedom";
import { GitHubAdapter } from "../dist-test/src/adapters/github.js";
import { HackerNewsAdapter } from "../dist-test/src/adapters/hn.js";
import { RssAdapter } from "../dist-test/src/adapters/rss.js";
import { UrlAdapter } from "../dist-test/src/adapters/url.js";

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30_000);
const context = {
  signal: controller.signal,
  now: () => new Date().toISOString(),
  parseHtml: (html) => parseHTML(html).document,
  request: async (url, headers = {}) => {
    const response = await fetch(url, { headers, signal: controller.signal });
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), text: await response.text() };
  }
};

const probes = [
  ["rss", new RssAdapter(), { sourceId: "rss-smoke", kind: "rss", enabled: true, url: "https://github.blog/changelog/feed/" }],
  ["url", new UrlAdapter(), { sourceId: "url-smoke", kind: "url", enabled: true, url: "https://example.com/" }],
  ["github", new GitHubAdapter(), { sourceId: "github-smoke", kind: "github", enabled: true, query: "obsidian plugin", limit: 2, pages: 1 }],
  ["hn", new HackerNewsAdapter(), { sourceId: "hn-smoke", kind: "hn", enabled: true, mode: "topstories", limit: 2 }],
  ["cn-direct", new RssAdapter("rsshub-compatible"), { sourceId: "cn-direct-smoke", kind: "rsshub-compatible", enabled: true, url: "https://www.solidot.org/index.rss" }],
  ["cn-public-rsshub", new RssAdapter("rsshub-compatible"), { sourceId: "cn-rsshub-smoke", kind: "rsshub-compatible", enabled: true, url: "https://rsshub.app/solidot/www" }]
];

let successful = 0;
for (const [name, adapter, source] of probes) {
  const result = await adapter.fetch(source, context);
  if (result.ok) {
    successful += 1;
    process.stdout.write(`${name}: ok items=${result.items.length} dropped=${result.droppedCount}\n`);
  } else {
    process.stdout.write(`${name}: ${result.code} stage=${result.stage} retryable=${result.retryable}${result.fallback ? ` fallback=${result.fallback}` : ""}\n`);
  }
}
clearTimeout(timeout);
if (successful < 4) process.exitCode = 1;
