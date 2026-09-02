import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeUrl, deduplicateItems, isPrivateNetworkHost, normalizeItem, replaceSourceItems } from "../src/normalize.js";
import type { RawItem } from "../src/normalize.js";

const raw = (overrides: Partial<RawItem> = {}): RawItem => ({
  sourceId: "rss-a",
  sourceKind: "rss",
  title: "  A useful article  ",
  url: "https://example.com/post?utm_source=test&id=1#section",
  externalId: "item-1",
  excerpt: "hello world",
  retrievedAt: "2026-08-28T00:00:00Z",
  parserVersion: "fixture-v1",
  verification: { reachable: true, status: 200, sourceRef: "fixture", checkedAt: "2026-08-28T00:00:00Z", parserVersion: "fixture-v1" },
  ...overrides
});

test("canonical URL removes only known tracking parameters and fragments", () => {
  assert.equal(canonicalizeUrl("https://example.com/post?utm_source=x&id=1&custom=y#part"), "https://example.com/post?id=1&custom=y");
});

test("resolved private IPv4 and IPv6 addresses are recognized", () => {
  assert.equal(isPrivateNetworkHost("192.168.1.2"), true);
  assert.equal(isPrivateNetworkHost("fd00::1"), true);
  assert.equal(isPrivateNetworkHost("8.8.8.8"), false);
});

test("normalization is bounded and drops missing title or URL", () => {
  const item = normalizeItem(raw({ excerpt: "x".repeat(700) }));
  assert.equal(item?.excerpt.length, 500);
  assert.equal(normalizeItem(raw({ title: "" })), undefined);
  assert.equal(normalizeItem(raw({ url: null })), undefined);
});

test("normalization canonicalizes publication times and infers dates from article URLs", () => {
  const explicit = normalizeItem(raw({ publishedAt: "2026-08-28 08:00:00+08:00" }))!;
  assert.equal(explicit.publishedAt, "2026-08-28T00:00:00.000Z");
  const inferred = normalizeItem(raw({ publishedAt: null, url: "https://tech.example.com/2026/07/24/article" }))!;
  assert.equal(inferred.publishedAt, "2026-07-24T00:00:00.000Z");
  const invalid = normalizeItem(raw({ publishedAt: "not-a-date" }))!;
  assert.equal(invalid.publishedAt, null);
});

test("normalization preserves non-negative popularity signals", () => {
  const item = normalizeItem(raw({ signals: { stars: 123.4, forks: -1, comments: 8 } }))!;
  assert.deepEqual(item.signals, { stars: 123, comments: 8 });
});

test("dedupe prioritizes source external ID, then canonical URL", () => {
  const first = normalizeItem(raw())!;
  const sameExternal = normalizeItem(raw({ url: "https://example.com/other", excerpt: "other" }))!;
  const sameUrl = normalizeItem(raw({ sourceId: "rss-b", externalId: null }))!;
  assert.deepEqual(deduplicateItems([first, sameExternal, sameUrl]), [first]);
  assert.equal(normalizeItem(raw())?.contentHash, normalizeItem(raw())?.contentHash);
});

test("replacing a refreshed source removes its stale snapshot before dedupe", () => {
  const oldItem = normalizeItem(raw({ title: "Old", excerpt: "old" }))!;
  const newItem = normalizeItem(raw({ title: "New", excerpt: "new" }))!;
  assert.deepEqual(replaceSourceItems([oldItem], "rss-a", [newItem]), [newItem]);
});
