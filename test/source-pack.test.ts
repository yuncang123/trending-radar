import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { createDefaultProfile } from "../src/profile-editor.js";
import { parseProfile } from "../src/profile.js";

const sourcePackPath = resolve("profiles/chinese-tech-v2.json");

test("Chinese Source Pack v2 is public, enabled, and directly RSS-backed", () => {
  const raw = readFileSync(sourcePackPath, "utf8");
  const profile = parseProfile(JSON.parse(raw));
  const enabled = profile.sources.filter((source) => source.enabled);

  assert.equal(profile.profileId, "chinese-tech-v2");
  assert.equal(enabled.length, 10);
  assert.equal(enabled.some((source) => source.sourceId === "cn-juejin"), false);
  assert.ok(enabled.some((source) => source.sourceId === "cn-meituan-tech"));
  assert.ok(enabled.some((source) => source.sourceId === "cn-ruanyifeng-weekly"));
  assert.equal(new Set(enabled.map((source) => source.sourceId)).size, enabled.length);
  assert.equal(new Set(enabled.map((source) => new URL(String(source.url)).hostname)).size, enabled.length);
  assert.ok(enabled.every((source) => source.kind === "rss"));
  assert.ok(enabled.every((source) => new URL(String(source.url)).protocol === "https:"));
  assert.ok(enabled.every((source) => typeof source.label === "string" && source.label.trim() !== ""));
  assert.ok(enabled.every((source) => source.limit === 10));
  assert.equal(raw.includes("rsshub.app"), false);
  assert.equal(/api.?key|authorization|credential|password|token/i.test(raw), false);
});

test("Chinese Source Pack v1 remains available as a stable baseline", () => {
  const raw = readFileSync(resolve("profiles/chinese-tech-v1.json"), "utf8");
  const profile = parseProfile(JSON.parse(raw));
  assert.equal(profile.profileId, "chinese-tech-v1");
  assert.equal(profile.sources.filter((source) => source.enabled).length, 6);
});

test("third-party source profile keeps discovery and self-hosted routes opt-in", () => {
  const raw = readFileSync(resolve("profiles/chinese-third-party-v1.json"), "utf8");
  const profile = parseProfile(JSON.parse(raw));
  const discovery = profile.sources.find((source) => source.sourceId === "cn-google-news-ai");
  const selfHosted = profile.sources.find((source) => source.sourceId === "cn-rsshub-self-hosted");

  assert.ok(discovery);
  assert.equal(discovery.enabled, true);
  assert.equal(discovery.kind, "rss");
  assert.match(String(discovery.url), /^https:\/\/news\.google\.com\/rss\/search\?/);
  assert.ok(selfHosted);
  assert.equal(selfHosted.enabled, false);
  assert.equal(selfHosted.kind, "rsshub-compatible");
  assert.match(String(selfHosted.url), /your-rsshub\.example/);
  assert.equal(/api.?key|authorization|credential|password|token/i.test(raw), false);
});

test("global technology profile covers Chinese developers and global technology feeds", () => {
  const raw = readFileSync(resolve("profiles/global-tech-v1.json"), "utf8");
  const profile = parseProfile(JSON.parse(raw));
  const enabled = profile.sources.filter((source) => source.enabled);

  assert.equal(profile.profileId, "global-tech-v1");
  assert.equal(enabled.length, 6);
  assert.ok(enabled.every((source) => source.kind === "rss"));
  assert.ok(enabled.every((source) => new URL(String(source.url)).protocol === "https:"));
  assert.equal(new Set(enabled.map((source) => source.sourceId)).size, enabled.length);
  assert.equal(/api.?key|authorization|credential|password|token/i.test(raw), false);
});

test("research signal profile uses bounded public Atom feeds", () => {
  const raw = readFileSync(resolve("profiles/research-signals-v1.json"), "utf8");
  const profile = parseProfile(JSON.parse(raw));
  const enabled = profile.sources.filter((source) => source.enabled);

  assert.equal(profile.profileId, "research-signals-v1");
  assert.equal(enabled.length, 2);
  assert.ok(enabled.every((source) => source.kind === "rss" && source.limit === 10));
  assert.ok(enabled.every((source) => String(source.url).startsWith("https://export.arxiv.org/api/query?")));
  assert.equal(/api.?key|authorization|credential|password|token/i.test(raw), false);
});

test("broad trending profile keeps a curated default and an opt-in discovery catalog", () => {
  const raw = readFileSync(resolve("profiles/broad-trending-v2.json"), "utf8");
  const profile = parseProfile(JSON.parse(raw));
  const enabled = profile.sources.filter((source) => source.enabled);
  const sections = profile.filter.sections as Array<{ sourceIds: string[] }>;

  assert.equal(profile.profileId, "broad-trending-v2");
  assert.equal(profile.version, "v2");
  assert.equal(profile.sources.length, 27);
  assert.equal(enabled.length, 14);
  assert.equal(enabled.some((source) => source.sourceId === "cn-sspai"), false);
  assert.equal(enabled.some((source) => source.sourceId === "cn-ithome"), false);
  assert.ok(enabled.some((source) => source.sourceId === "cn-meituan-tech"));
  assert.ok(enabled.some((source) => source.sourceId === "cn-ruanyifeng-weekly"));
  assert.ok(enabled.some((source) => source.sourceId === "global-google-ai"));
  assert.ok(enabled.some((source) => source.sourceId === "global-wired"));
  assert.equal(profile.topics.includes("product"), false);
  assert.equal(profile.topics.includes("产品"), false);
  assert.equal(sections.length, 5);
  assert.equal(new Set(sections.flatMap((section) => section.sourceIds)).size, profile.sources.length);
  assert.equal(profile.filter.maxItemsPerSource, undefined);
  assert.equal(profile.templateId, "sectioned-v1");
  assert.equal(/api.?key|authorization|credential|password|token/i.test(raw), false);
});

test("the community-install default stays aligned with the broad release Profile", () => {
  const broad = parseProfile(JSON.parse(readFileSync(resolve("profiles/broad-trending-v2.json"), "utf8")));
  const builtIn = createDefaultProfile("Custom Output");

  assert.equal(builtIn.outputDirectory, "Custom Output");
  assert.deepEqual(builtIn.sources, broad.sources);
  assert.deepEqual(builtIn.topics, broad.topics);
  assert.deepEqual(builtIn.filter, broad.filter);
  assert.equal(builtIn.templateId, broad.templateId);
});
