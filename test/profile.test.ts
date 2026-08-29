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
