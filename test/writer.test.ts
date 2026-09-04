import assert from "node:assert/strict";
import test from "node:test";
import { appendFactAppendix, createAiRankedDraftInput, createDraftInput, renderAiRankedDraft, renderTemplateDraft, selectTrendItems, validateExternalWriterOutput } from "../src/writer.js";
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
  assert.deepEqual(selected.selection, {
    candidateCount: 3,
    selectedCount: 2,
    maxItems: 2,
    requireTopicMatch: false,
    filterStats: {
      maxAgeHours: 24,
      requirePublishedAt: true,
      collectedCount: 3,
      qualityPassedCount: 3,
      freshnessPassedCount: 3,
      topicMatchedCount: 3,
      topicPassedCount: 3,
      exclusionPassedCount: 3,
      effectiveCandidateCount: 3,
      unknownPublishedAtCount: 0,
      unknownPublishedAtDroppedCount: 0,
      staleDroppedCount: 0
    }
  });
  assert.deepEqual(selectTrendItems(input, ["software"], { maxItems: 50 }).items.map((entry) => entry.sourceId), ["b", "z", "a"]);
});

test("requireTopicMatch excludes non-matching items and daily mode rejects null dates", () => {
  const selected = selectTrendItems([item("a", "No match", null), item("b", "Software update", null), item("c", "Software today", "2026-08-29T00:00:00Z")], ["software"], { requireTopicMatch: true });
  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["c"]);
  assert.equal(selected.selection.candidateCount, 3);
});

test("freshness filtering reports effective candidates and stale items", () => {
  const selected = selectTrendItems([
    item("fresh", "AI fresh", "2026-08-29T00:00:00Z"),
    item("stale", "AI stale", "2026-08-27T00:00:00Z"),
    item("unknown", "AI unknown", null)
  ], ["AI"], { maxAgeHours: 24, requireTopicMatch: true });
  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["fresh"]);
  assert.deepEqual(selected.selection.filterStats, {
    maxAgeHours: 24,
    requirePublishedAt: true,
    collectedCount: 3,
    qualityPassedCount: 3,
    freshnessPassedCount: 1,
    topicMatchedCount: 1,
    topicPassedCount: 1,
    exclusionPassedCount: 1,
    effectiveCandidateCount: 1,
    unknownPublishedAtCount: 1,
    unknownPublishedAtDroppedCount: 1,
    staleDroppedCount: 1
  });
});

test("popularity signals break equal-topic ties", () => {
  const selected = selectTrendItems([
    { ...item("low", "AI project", "2026-08-29T00:00:00Z"), signals: { stars: 10 } },
    { ...item("high", "AI project", "2026-08-29T00:00:00Z"), signals: { stars: 1000 } }
  ], ["AI"], { maxItems: 1 });
  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["high"]);
});

test("source IDs do not create false topic matches", () => {
  const selected = selectTrendItems([item("global-github-ai", "Unrelated repository", "2026-08-29T00:00:00Z")], ["AI"], { requireTopicMatch: true });
  assert.equal(selected.items.length, 0);
});

test("short ASCII topics match whole terms instead of fragments inside unrelated words", () => {
  const selected = selectTrendItems([
    item("aircraft", "Aircraft remains aloft for a year", "2026-08-29T00:00:00Z"),
    item("raindrops", "Raindrops are tiny lightning bolts", "2026-08-29T00:00:00Z"),
    item("funding", "Polymarket raises new funding", "2026-08-29T00:00:00Z"),
    item("ai", "An AI-powered coding assistant", "2026-08-29T00:00:00Z")
  ], ["AI"], { requireTopicMatch: true });
  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["ai"]);
});

test("quality gates remove placeholder and future-dated items", () => {
  const selected = selectTrendItems([
    item("infoq", "AI placeholder", "2026-08-29T00:00:00Z", "点击查看原文>"),
    item("rss", "AI future", "2999-01-01T00:00:00Z", "useful context"),
    item("rss", "AI usable", "2026-08-29T00:00:00Z", "useful context")
  ], ["AI"], { maxItems: 10, requireTopicMatch: true, excludeLowQuality: true, rejectFuturePublishedAt: true });
  assert.deepEqual(selected.items.map((entry) => entry.title), ["AI usable"]);
});

test("sections classify globally selected trends and retain empty configured blocks", () => {
  const selected = selectTrendItems([
    item("oss-a", "Open source tool", "2026-08-29T04:00:00Z", "open source"),
    item("oss-b", "Open source library", "2026-08-29T03:00:00Z", "open source"),
    item("media", "AI launch", "2026-08-29T02:00:00Z", "AI product"),
    item("extra", "AI discovery", "2026-08-29T01:00:00Z", "AI")
  ], ["AI", "open source"], {
    maxItems: 4,
    maxItemsPerSource: 2,
    explorePerSection: true,
    backfill: true,
    sections: [
      { sectionId: "open-source", label: "开源观察", sourceIds: ["oss-a", "oss-b"], keywords: ["open source"], maxItems: 3 },
      { sectionId: "media", label: "媒体资讯", sourceIds: ["missing"], keywords: ["media"], maxItems: 1 }
    ]
  });
  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["oss-a", "oss-b", "media", "extra"]);
  assert.deepEqual(selected.selection.sections?.map((section) => [section.sectionId, section.selectedCount]), [["open-source", 2], ["media", 0], ["other", 2]]);
});

test("section order and caps cannot displace globally higher-ranked trends", () => {
  const selected = selectTrendItems([
    item("oss-a", "AI one", "2026-08-28T04:00:00Z"),
    item("oss-a", "AI two", "2026-08-28T03:00:00Z"),
    item("oss-a", "AI three", "2026-08-28T02:00:00Z"),
    item("media-a", "AI product", "2026-08-28T06:00:00Z"),
    item("media-a", "AI launch", "2026-08-28T05:00:00Z"),
    item("media-a", "AI launch follow-up", "2026-08-28T01:00:00Z")
  ], ["AI"], {
    maxItems: 4,
    maxItemsPerSource: 2,
    sections: [
      { sectionId: "open-source", label: "开源观察", sourceIds: ["oss-a", "oss-b"], maxItems: 3 },
      { sectionId: "media", label: "媒体资讯", sourceIds: ["media-a"], maxItems: 2 }
    ]
  });

  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["media-a", "media-a", "oss-a", "oss-a"]);
  assert.equal(selected.selection.maxItemsPerSource, undefined);
  assert.deepEqual(selected.selection.sections?.map((section) => [section.sectionId, section.selectedCount]), [["open-source", 2], ["media", 2]]);
});

test("global ranking wins when the highest-scoring item belongs to a later section", () => {
  const selected = selectTrendItems([
    item("early", "AI ordinary", "2026-08-29T03:00:00Z"),
    item("late", "AI Agent MCP breakthrough", "2026-08-29T02:00:00Z"),
    item("early", "AI ordinary two", "2026-08-29T01:00:00Z")
  ], ["AI", "Agent", "MCP"], {
    maxItems: 1,
    sections: [
      { sectionId: "early", label: "前置分区", sourceIds: ["early"], maxItems: 1 },
      { sectionId: "late", label: "后置分区", sourceIds: ["late"], maxItems: 1 }
    ]
  });

  assert.deepEqual(selected.items.map((entry) => entry.sourceId), ["late"]);
  assert.deepEqual(selected.selection.sections?.map((section) => [section.sectionId, section.selectedCount]), [["early", 0], ["late", 1]]);
});

test("sectioned template renders one report with multiple blocks", () => {
  const input = createDraftInput({
    runId: "run-sectioned",
    profileId: "broad",
    profileVersion: "v1",
    status: "completed",
    generatedAt: "2026-08-29T00:10:00Z",
    templateId: "sectioned-v1",
    topics: ["AI"],
    filter: {
      maxItems: 4,
      sections: [
        { sectionId: "open-source", label: "开源观察", sourceIds: ["oss"], maxItems: 2 },
        { sectionId: "media", label: "媒体资讯", sourceIds: ["media"], maxItems: 2 }
      ]
    },
    items: [item("oss", "AI repository", "2026-08-29T00:00:00Z"), item("media", "AI launch", "2026-08-29T01:00:00Z")],
    failures: []
  });
  const output = renderTemplateDraft(input);
  assert.match(output.markdown, /### 开源观察 \(1\)/);
  assert.match(output.markdown, /### 媒体资讯 \(1\)/);
  assert.match(output.markdown, /#### 1\. AI repository/);
  assert.match(output.markdown, /#### 2\. AI launch/);
  assert.equal(validateExternalWriterOutput(input, output).ok, true);
  assert.equal(validateExternalWriterOutput(input, { ...output, markdown: output.markdown.replace("媒体资讯", "其他") }).ok, false);
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
  const input = createDraftInput({ runId: "run-appendix", profileId: "default", profileVersion: "v1", status: "partial", generatedAt: "2026-08-29T00:10:00Z", templateId: "default", topics: ["software"], filter: {}, items: [item("rss-a", "Title", "2026-08-29T00:00:00Z")], failures: [failure] });
  const markdown = appendFactAppendix(input, "# A readable provider summary");
  const output: WriterOutput = { schemaVersion: "v1", title: "Trending Radar 2026-08-29", markdown, writerId: "provider:model", writerVersion: "v1", writerFallback: false };
  assert.equal(validateExternalWriterOutput(input, output).ok, true);
  assert.match(markdown, /## Verified source facts/);
  assert.match(markdown, /rss-a \| Title \| https:\/\/example.com/);
  assert.match(markdown, /Failure: hn \| fetch \| TIMEOUT/);
});

test("AI-ranked draft shows only selected events with their score and reason", () => {
  const original = createDraftInput({
    runId: "run-ranked", profileId: "default", profileVersion: "v1", status: "completed", generatedAt: "2026-08-29T00:10:00Z",
    templateId: "default", topics: ["AI"], filter: { maxItems: 50 },
    items: [item("high", "Major AI launch", "2026-08-29T00:00:00Z"), item("low", "AI tutorial", "2026-08-29T00:00:00Z")], failures: []
  });
  const ranked = createAiRankedDraftInput(original, [original.items[0]!], 15);
  const rendered = renderAiRankedDraft(ranked, {
    model: "model-x", minimumScore: 70, candidateCount: 2,
    scores: new Map([[ranked.items[0]!.url, { index: 0, score: 92, eventKey: "major-launch", reason: "Material product launch" }]])
  });
  assert.match(rendered.markdown, /AI score: 92\/100 — Material product launch/);
  assert.match(rendered.markdown, /Major AI launch/);
  assert.doesNotMatch(rendered.markdown, /AI tutorial/);
  const candidate = { ...rendered, markdown: appendFactAppendix(original, rendered.markdown) };
  assert.equal(validateExternalWriterOutput(original, candidate).ok, true);
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
