import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getSourceGuide, hasBuiltInSourceGuide } from "../src/source-guide.js";
import type { Profile, SourceConfig } from "../src/types.js";

test("every source shipped in a built-in Profile has a curated guide", () => {
  const sourceIds = new Set<string>();
  for (const file of readdirSync("profiles").filter((name) => name.endsWith(".json"))) {
    const profile = JSON.parse(readFileSync(join("profiles", file), "utf8")) as Profile;
    for (const source of profile.sources) sourceIds.add(source.sourceId);
  }
  assert.deepEqual([...sourceIds].filter((sourceId) => !hasBuiltInSourceGuide(sourceId)), []);
});

test("known sources return localized introductions and useful keywords", () => {
  const source: SourceConfig = { sourceId: "cn-qbitai", kind: "rss", enabled: true };
  assert.match(getSourceGuide(source, "zh-CN").intro, /AI 研究/);
  assert.match(getSourceGuide(source, "en").intro, /Chinese AI media/);
  assert.deepEqual(getSourceGuide(source, "zh-CN").keywords, ["AI", "大模型", "研究", "产业"]);
});

test("custom sources receive a type-based fallback guide", () => {
  const source: SourceConfig = { sourceId: "custom-feed", kind: "rss", enabled: true };
  assert.match(getSourceGuide(source, "zh-CN").intro, /RSS/);
  assert.deepEqual(getSourceGuide(source, "zh-CN").keywords, ["RSS", "公开订阅"]);
});

test("Profile extension fields can override the display guide without changing the contract", () => {
  const source: SourceConfig = {
    sourceId: "custom-feed",
    kind: "rss",
    enabled: true,
    description: { en: "Custom description", "zh-CN": "自定义简介" },
    keywords: ["custom", " 自定义 "]
  };
  assert.deepEqual(getSourceGuide(source, "zh-CN"), { intro: "自定义简介", keywords: ["custom", "自定义"] });
});
