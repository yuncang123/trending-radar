import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { GitHubAdapter } from "../src/adapters/github.js";
import { HackerNewsAdapter } from "../src/adapters/hn.js";
import { RssAdapter } from "../src/adapters/rss.js";
import { UrlAdapter } from "../src/adapters/url.js";
import type { FetchContext, HttpResponse, SourceConfig } from "../src/types.js";

type Handler = HttpResponse | Error;

function context(routes: Record<string, Handler>, controller = new AbortController(), requests: string[] = []): FetchContext {
  return {
    signal: controller.signal,
    now: () => "2026-08-28T00:00:00Z",
    parseHtml: (html) => parseHTML(html).document as unknown as Document,
    request: async (url) => {
      requests.push(url);
      const entry = routes[url];
      if (!entry) throw new Error(`unexpected URL: ${url}`);
      if (entry instanceof Error) throw entry;
      return entry;
    }
  };
}

const response = (text: string, status = 200): HttpResponse => ({ status, headers: {}, text });
const source = (sourceId: string, kind: SourceConfig["kind"], extra: Record<string, unknown>): SourceConfig => ({ sourceId, kind, enabled: true, ...extra });

test("RSS and Atom fixtures normalize items and expose parser version", async () => {
  const rssUrl = "https://example.com/feed.xml";
  const atomUrl = "https://example.com/atom.xml";
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>RSS item</title><link>https://example.com/rss?utm_source=x</link><guid>r1</guid><description>Hello</description></item></channel></rss>`;
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>Atom item</title><id>a1</id><link href="https://example.com/atom"/><summary>World</summary></entry></feed>`;
  const rssResult = await new RssAdapter().fetch(source("rss", "rss", { url: rssUrl }), context({ [rssUrl]: response(rss) }));
  const atomResult = await new RssAdapter().fetch(source("atom", "rss", { url: atomUrl }), context({ [atomUrl]: response(atom) }));
  assert.equal(rssResult.ok && rssResult.items[0]?.url, "https://example.com/rss");
  assert.equal(atomResult.ok && atomResult.items[0]?.externalId, "a1");
  assert.match(rssResult.ok ? rssResult.items[0]!.parserVersion : "", /rss-parser/);
});

test("RSS source limit bounds retained items without changing feed parsing", async () => {
  const url = "https://example.com/limited.xml";
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title><item><title>First</title><link>https://example.com/first</link></item><item><title>Second</title><link>https://example.com/second</link></item></channel></rss>`;
  const result = await new RssAdapter().fetch(source("limited", "rss", { url, limit: 1 }), context({ [url]: response(rss) }));
  assert.equal(result.ok && result.items.length, 1);
  assert.equal(result.ok && result.items[0]?.title, "First");
});

test("manual URL uses Readability and rejects content-free pages", async () => {
  const url = "https://example.com/article";
  const html = `<html><head><title>Readable title</title></head><body><article><h1>Readable title</h1><p>${"Useful content. ".repeat(40)}</p></article></body></html>`;
  const result = await new UrlAdapter().fetch(source("url", "url", { url }), context({ [url]: response(html) }));
  assert.equal(result.ok, true);
  assert.match(result.ok ? result.items[0]!.excerpt : "", /Useful content/);
  const blocked = await new UrlAdapter().fetch(source("blocked", "url", { url }), context({ [url]: response("<html><title>Login</title></html>") }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.ok ? "" : blocked.code, "CONTENT_UNAVAILABLE");
});

test("GitHub adapter paginates and reports rate limits and timeouts", async () => {
  const first = "https://api.github.com/search/repositories?q=obsidian&sort=updated&order=desc&per_page=1&page=1";
  const second = "https://api.github.com/search/repositories?q=obsidian&sort=updated&order=desc&per_page=1&page=2";
  const requests: string[] = [];
  const adapter = new GitHubAdapter();
  const result = await adapter.fetch(source("github", "github", { query: "obsidian", limit: 1, pages: 2 }), context({
    [first]: response(JSON.stringify({ items: [{ id: 1, full_name: "owner/repo", html_url: "https://github.com/owner/repo", description: "demo", updated_at: "2026-08-28T00:00:00Z", owner: { login: "owner" } }] })),
    [second]: response(JSON.stringify({ items: [] }))
  }, undefined, requests));
  assert.equal(result.ok && result.items[0]?.externalId, "1");
  assert.equal(requests.length, 2);
  const limited = await adapter.fetch(source("github", "github", { query: "obsidian" }), context({ [first.replace("per_page=1", "per_page=30")]: response("{}", 429) }));
  assert.equal(limited.ok ? "" : limited.code, "RATE_LIMITED");
  assert.equal(limited.ok ? false : limited.retryable, true);
  const timedOut = await adapter.fetch(source("github", "github", { query: "obsidian" }), context({ [first.replace("per_page=1", "per_page=30")]: new Error("request timeout") }));
  assert.equal(timedOut.ok ? "" : timedOut.code, "TIMEOUT");
});

test("Hacker News adapter loads public story IDs and item records", async () => {
  const base = "https://hacker-news.firebaseio.com/v0";
  const result = await new HackerNewsAdapter().fetch(source("hn", "hn", { mode: "topstories", limit: 1 }), context({
    [`${base}/topstories.json`]: response("[42]"),
    [`${base}/item/42.json`]: response(JSON.stringify({ id: 42, type: "story", title: "HN story", by: "user", time: 1787875200 }))
  }));
  assert.equal(result.ok && result.items[0]?.url, "https://news.ycombinator.com/item?id=42");
});

test("RSSHub-compatible failures include self-hosted fallback and cancellation is explicit", async () => {
  const url = "https://rsshub.example/route";
  const failed = await new RssAdapter("rsshub-compatible").fetch(source("cn", "rsshub-compatible", { url }), context({ [url]: response("down", 503) }));
  assert.match(failed.ok ? "" : failed.fallback ?? "", /self-hosted/);
  const controller = new AbortController();
  controller.abort();
  const cancelled = await new RssAdapter().fetch(source("rss", "rss", { url }), context({}, controller));
  assert.equal(cancelled.ok ? "" : cancelled.code, "CANCELLED");
});

test("private and localhost URLs are rejected before network access", async () => {
  const result = await new RssAdapter().fetch(source("private", "rss", { url: "http://127.0.0.1/feed" }), context({}));
  assert.equal(result.ok ? "" : result.code, "INVALID_URL");
});
