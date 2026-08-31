import assert from "node:assert/strict";
import test from "node:test";
import { parseProfile } from "../src/profile.js";

const valid = {
  profileId: "default",
  version: "v1",
  outputDirectory: "Trending Radar",
  sources: [{ sourceId: "rss-a", kind: "rss", enabled: true }],
  topics: ["software"],
  filter: { maxItems: 10 },
  templateId: "default"
};

test("parses a valid JSON-equivalent Profile", () => {
  assert.equal(parseProfile(valid).profileId, "default");
});

test("rejects duplicate source IDs and unknown kinds", () => {
  assert.throws(() => parseProfile({ ...valid, sources: [valid.sources[0], valid.sources[0]] }), /duplicate sourceId/);
  assert.throws(() => parseProfile({ ...valid, sources: [{ sourceId: "x", kind: "unknown", enabled: true }] }), /unknown source kind/);
});

test("rejects provider secrets in shared configuration", () => {
  assert.throws(() => parseProfile({ ...valid, provider: { apiKey: "not-shared" } }), /private provider field/);
  assert.throws(() => parseProfile({ ...valid, provider: { endpoint: "https://private.example" } }), /private provider field/);
});

test("rejects path traversal in source IDs and output directories", () => {
  assert.throws(() => parseProfile({ ...valid, sources: [{ sourceId: "../escape", kind: "rss", enabled: true }] }), /safe stable identifier/);
  assert.throws(() => parseProfile({ ...valid, outputDirectory: "../outside" }), /inside the vault/);
});

test("validates deterministic section and per-source selection settings", () => {
  const sectioned = parseProfile({
    ...valid,
    filter: {
      maxItems: 10,
      maxItemsPerSource: 2,
      sections: [{ sectionId: "open-source", label: "开源观察", maxItems: 5, sourceIds: ["rss-a"] }]
    }
  });
  assert.equal(sectioned.filter.maxItemsPerSource, 2);
  assert.throws(() => parseProfile({ ...valid, filter: { sections: "invalid" } }), /filter.sections must be an array/);
  assert.throws(() => parseProfile({
    ...valid,
    filter: { sections: [
      { sectionId: "a", label: "A", maxItems: 1, sourceIds: ["rss-a"] },
      { sectionId: "b", label: "B", maxItems: 1, sourceIds: ["rss-a"] }
    ] }
  }), /assigned to multiple sections/);
});
