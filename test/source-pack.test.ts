import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parseProfile } from "../src/profile.js";

const sourcePackPath = resolve("profiles/chinese-tech-v2.json");

test("Chinese Source Pack v2 is public, enabled, and directly RSS-backed", () => {
  const raw = readFileSync(sourcePackPath, "utf8");
  const profile = parseProfile(JSON.parse(raw));
  const enabled = profile.sources.filter((source) => source.enabled);

  assert.equal(profile.profileId, "chinese-tech-v2");
  assert.equal(enabled.length, 9);
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
