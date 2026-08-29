import assert from "node:assert/strict";
import test from "node:test";
import { appendFactAppendix, createDraftInput, renderTemplateDraft, selectTrendItems, validateExternalWriterOutput } from "../src/writer.js";
import type { NormalizedItem, SourceFailure, WriterOutput } from "../src/types.js";

function item(sourceId: string, title: string, publishedAt: string | null, excerpt = ""): NormalizedItem {
  return {
    sourceId, sourceKind: "rss", title, url: `https://example.com/${sourceId}/${encodeURIComponent(title)}`,
    externalId: null, publishedAt, author: null, excerpt, contentHash: `${sourceId}-${title}`, retrievedAt: "2026-08-29T00:00:00Z", parserVersion: "fixture-v1",
    verification: { reachable: true, status: 200, sourceRef: "fixture", checkedAt: "2026-08-29T00:00:00Z", parserVersion: "fixture-v1" }
  };
}

const failure: SourceFailure = { ok: false, sourceId: "hn", stage: "fetch", code: "TIMEOUT", message: "upstream timed out", retryable: true, retrievedAt: "2026-08-29T00:00:00Z", fallback: "retry later" };

test("writer scores topics, sorts deterministically, and applies maxItems", () => {
  const input = [item("z", "Older software", "2026-08-28T00:00:00Z"), item("a", "New open source", "2026-08-29T00:00:00Z"), item("b", "Newest software", "2026-08-29T00:00:00Z", "open source tooling")];
  const selected = selectTrendItems(input, ["software", "open source"], { maxItems: 2 });
  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["b", "a"]);
  assert.deepEqual(selected.selection, { candidateCount: 3, selectedCount: 2, maxItems: 2, requireTopicMatch: false });
  assert.deepEqual(selectTrendItems(input, ["software"], { maxItems: 50 }).items.map((entry) => entry.sourceId), ["b", "z", "a"]);
});

test("requireTopicMatch excludes non-matching items and puts null dates last", () => {
  const selected = selectTrendItems([item("a", "No match", null), item("b", "Software update", null), item("c", "Software today", "2026-08-29T00:00:00Z")], ["software"], { requireTopicMatch: true });
  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["c", "b"]);
  assert.equal(selected.selection.candidateCount, 3);
});

test("template draft always exposes status and failures, including an empty selection", () => {
  const input = createDraftInput({ runId: "run-1", profileId: "default", profileVersion: "v1", status: "partial", generatedAt: "2026-08-29T00:10:00Z", templateId: "default", topics: ["software"], filter: { maxItems: 1 }, items: [], failures: [failure] });
  const output = renderTemplateDraft(input);
  assert.equal(output.writerId, "template");
  assert.match(output.markdown, /Status: `partial`/);
  assert.match(output.markdown, /`hn` at `fetch` \(`TIMEOUT`\)/);
  assert.match(output.markdown, /retryable; fallback: retry later/);
  assert.match(output.markdown, /No usable items were selected/);
});

test("same DraftInput renders byte-for-byte identical Markdown", () => {
  const input = createDraftInput({ runId: "run-2", profileId: "default", profileVersion: "v1", status: "completed", generatedAt: "2026-08-29T00:10:00Z", templateId: "default", topics: [], filter: {}, items: [item("a", "Title", null)], failures: [] });
  assert.equal(renderTemplateDraft(input).markdown, renderTemplateDraft(input).markdown);
});

test("provider prose can be followed by a deterministic fact appendix", () => {
  const input = createDraftInput({ runId: "run-appendix", profileId: "default", profileVersion: "v1", status: "partial", generatedAt: "2026-08-29T00:10:00Z", templateId: "default", topics: ["software"], filter: {}, items: [item("rss-a", "Title", null)], failures: [failure] });
  const markdown = appendFactAppendix(input, "# A readable provider summary");
  const output: WriterOutput = { schemaVersion: "v1", title: "Trending Radar 2026-08-29", markdown, writerId: "provider:model", writerVersion: "v1", writerFallback: false };
  assert.equal(validateExternalWriterOutput(input, output).ok, true);
  assert.match(markdown, /## Verified source facts/);
  assert.match(markdown, /rss-a \| Title \| https:\/\/example.com/);
  assert.match(markdown, /Failure: hn \| fetch \| TIMEOUT/);
});

test("external writer output is accepted only when it preserves run and fact anchors", () => {
  const input = createDraftInput({ runId: "run-external", profileId: "default", profileVersion: "v1", status: "partial", generatedAt: "2026-08-29T00:10:00Z", templateId: "default", topics: ["software"], filter: {}, items: [item("rss-a", "Title", null)], failures: [failure] });
  const output: WriterOutput = {
    schemaVersion: "v1", title: "Trending Radar 2026-08-29", writerId: "external", writerVersion: "v1", writerFallback: false,
    markdown: "# Trending Radar 2026-08-29\nStatus: partial\nRun: run-external\nProfile: default / v1\nCandidates: 1; selected: 1\nTopics: software\nFailure: hn fetch TIMEOUT\nItem: Title https://example.com/rss-a/Title\nSource: rss-a"
  };
  const accepted = validateExternalWriterOutput(input, output);
  assert.equal(accepted.ok, true);
  const rejected = validateExternalWriterOutput(input, { ...output, markdown: output.markdown.replace("run-external", "other-run") });
  assert.equal(rejected.ok, false);
});

test("external writer output rejects malformed structure and missing facts", () => {
  const input = createDraftInput({ runId: "run-invalid", profileId: "default", profileVersion: "v1", status: "completed", generatedAt: "2026-08-29T00:10:00Z", templateId: "default", topics: [], filter: {}, items: [item("rss-a", "Title", null)], failures: [] });
  assert.equal(validateExternalWriterOutput(input, null).ok, false);
  assert.equal(validateExternalWriterOutput(input, {
    schemaVersion: "v1", title: "x", markdown: "run-invalid", writerId: "external", writerVersion: "v1", writerFallback: false
  }).ok, false);
});
