import assert from "node:assert/strict";
import test from "node:test";
import { buildAnthropicModelsRequest, buildAnthropicProbeRequest, buildAnthropicRankingRequest, buildAnthropicRequest, extractAnthropicText, extractProviderModels, PROVIDER_TIMEOUTS_MS } from "../src/provider.js";
import type { DraftInput } from "../src/types.js";

const input: DraftInput = {
  schemaVersion: "v1",
  runId: "run-provider",
  profileId: "example",
  profileVersion: "v2",
  status: "partial",
  generatedAt: "2026-08-29T00:00:00Z",
  templateId: "default",
  topics: ["software"],
  selection: { candidateCount: 2, selectedCount: 1, maxItems: 1, requireTopicMatch: false },
  items: [],
  failures: []
};

test("buildAnthropicRequest normalizes the gateway URL and keeps DraftInput in the prompt", () => {
  const request = buildAnthropicRequest(" https://gateway.example/api/// ", "secret-key", " model-x ", input, 128);
  assert.equal(request.url, "https://gateway.example/api/v1/messages");
  assert.equal(request.headers.Authorization, "Bearer secret-key");
  assert.equal(request.headers["x-api-key"], "secret-key");
  const body = JSON.parse(request.body) as { model: string; max_tokens: number; messages: Array<{ content: string }> };
  assert.equal(body.model, "model-x");
  assert.equal(body.max_tokens, 128);
  assert.equal(body.messages.length, 1);
  assert.match(body.messages[0].content, /run-provider/);
  assert.match(body.messages[0].content, /Return one complete, readable Markdown daily report/);
  assert.equal(request.body.includes("secret-key"), false);
});

test("buildAnthropicRankingRequest sends a bounded fact projection and scoring rubric", () => {
  const rankingInput: DraftInput = { ...input, items: [{
    sourceId: "rss-a", sourceKind: "rss", title: "AI launch", url: "https://example.com/launch", externalId: null,
    publishedAt: "2026-09-04T00:00:00Z", author: null, excerpt: "A launch", contentHash: "hash", retrievedAt: "2026-09-04T01:00:00Z", parserVersion: "v1",
    verification: { reachable: true, status: 200, sourceRef: "feed", checkedAt: "2026-09-04T01:00:00Z", parserVersion: "v1" }
  }] };
  const request = buildAnthropicRankingRequest("https://gateway.example/api", "secret-key", "model-x", rankingInput, {
    maxTokens: 1024,
    sources: [{ sourceId: "rss-a", label: "Example", kind: "rss", introduction: "A primary technology feed.", keywords: ["technology"] }]
  });
  const body = JSON.parse(request.body) as { model: string; max_tokens: number; messages: Array<{ content: string }> };
  assert.equal(body.model, "model-x");
  assert.equal(body.max_tokens, 1024);
  assert.match(body.messages[0]?.content ?? "", /trend importance 40/);
  assert.match(body.messages[0]?.content ?? "", /AI launch/);
  assert.match(body.messages[0]?.content ?? "", /A primary technology feed/);
  assert.equal(request.body.includes("secret-key"), false);
  assert.equal(request.body.includes("verification"), false);
});

test("extractAnthropicText joins text blocks and ignores non-text blocks", () => {
  const raw = JSON.stringify({ content: [{ type: "thinking", text: "ignore" }, { type: "text", text: "# First" }, { type: "text", text: "Second" }] });
  assert.equal(extractAnthropicText(raw), "# First\n\nSecond");
});

test("extractAnthropicText rejects malformed and empty responses", () => {
  assert.equal(extractAnthropicText("not-json"), undefined);
  assert.equal(extractAnthropicText(JSON.stringify({ content: [] })), undefined);
  assert.equal(extractAnthropicText(JSON.stringify({ content: [{ type: "text", text: "  " }] })), undefined);
  assert.equal(extractAnthropicText(JSON.stringify({ content: [{ type: "image", source: {} }] })), undefined);
});

test("buildAnthropicModelsRequest uses an OpenAI-compatible models endpoint", () => {
  const request = buildAnthropicModelsRequest("https://gateway.example/api///", "secret-key");
  assert.equal(request.url, "https://gateway.example/api/v1/models");
  assert.equal(request.body, "");
  assert.equal(request.headers["x-api-key"], "secret-key");
  assert.equal(request.body.includes("secret-key"), false);
  const versioned = buildAnthropicModelsRequest("https://gateway.example/api/v1", "secret-key");
  assert.equal(versioned.url, "https://gateway.example/api/v1/models");
});

test("buildAnthropicProbeRequest sends only a tiny fixed verification prompt", () => {
  const request = buildAnthropicProbeRequest("https://gateway.example/api", "secret-key", "model-x");
  assert.equal(request.url, "https://gateway.example/api/v1/messages");
  const body = JSON.parse(request.body) as { model: string; max_tokens: number; messages: Array<{ content: string }> };
  assert.deepEqual(body, { model: "model-x", max_tokens: 8, messages: [{ role: "user", content: "Reply with exactly OK." }] });
  assert.equal(request.body.includes("secret-key"), false);
});

test("Provider timeout budgets reserve a longer window for the complete AI draft", () => {
  assert.deepEqual(PROVIDER_TIMEOUTS_MS, { models: 20_000, verify: 30_000, aiDraft: 180_000 });
});

test("extractProviderModels parses, deduplicates, and sorts advertised model IDs", () => {
  const models = extractProviderModels(JSON.stringify({ data: [
    { id: "z-model", owned_by: "z" },
    { id: "a-model", ownedBy: "a" },
    { id: "z-model", owned_by: "duplicate" },
    { id: "", owned_by: "ignored" },
    { id: 42 }
  ] }));
  assert.deepEqual(models, [{ id: "a-model", ownedBy: "a" }, { id: "z-model", ownedBy: "z" }]);
  assert.deepEqual(extractProviderModels(JSON.stringify({ data: [] })), []);
  assert.deepEqual(extractProviderModels("invalid-json"), []);
});
