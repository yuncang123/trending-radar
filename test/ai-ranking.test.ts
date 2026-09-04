import assert from "node:assert/strict";
import test from "node:test";
import { createAiRankingArtifact, parseAiScores, selectAiRankedItems } from "../src/ai-ranking.js";
import type { DraftInput, NormalizedItem } from "../src/types.js";

function item(sourceId: string, title: string): NormalizedItem {
  return {
    sourceId, sourceKind: "rss", title, url: `https://example.com/${sourceId}`,
    externalId: null, publishedAt: "2026-09-04T00:00:00Z", author: null, excerpt: `${title} excerpt`,
    contentHash: sourceId, retrievedAt: "2026-09-04T01:00:00Z", parserVersion: "fixture-v1",
    verification: { reachable: true, status: 200, sourceRef: "fixture", checkedAt: "2026-09-04T01:00:00Z", parserVersion: "fixture-v1" }
  };
}

const items = [item("a", "Major AI launch"), item("b", "Duplicate coverage"), item("c", "Minor tutorial")];

test("AI score parser requires one bounded score for every candidate", () => {
  const valid = JSON.stringify({ scores: [
    { index: 0, score: 91, eventKey: "major-launch", reason: "Material launch" },
    { index: 1, score: 84, eventKey: "major-launch", reason: "Secondary coverage" },
    { index: 2, score: 42, eventKey: "minor-tutorial", reason: "Tutorial" }
  ] });
  assert.equal(parseAiScores(valid, 3)?.length, 3);
  assert.equal(parseAiScores(`\`\`\`json\n${valid}\n\`\`\``, 3)?.[0]?.score, 91);
  assert.equal(parseAiScores(JSON.stringify({ scores: [{ index: 0, score: 101, eventKey: "x", reason: "x" }] }), 1), undefined);
  assert.equal(parseAiScores(JSON.stringify({ scores: [{ index: 0, score: 90, eventKey: "x", reason: "x" }] }), 2), undefined);
  assert.equal(parseAiScores(JSON.stringify({ scores: [
    { index: 0, score: 90, eventKey: "x", reason: "x" },
    { index: 0, score: 80, eventKey: "y", reason: "y" }
  ] }), 2), undefined);
});

test("AI selection applies score threshold, event deduplication, and item cap deterministically", () => {
  const scores = [
    { index: 0, score: 91, eventKey: "Major Launch", reason: "Material launch" },
    { index: 1, score: 84, eventKey: " major launch ", reason: "Secondary coverage" },
    { index: 2, score: 42, eventKey: "minor-tutorial", reason: "Tutorial" }
  ];
  const selected = selectAiRankedItems(items, scores, 70, 15);
  assert.deepEqual(selected.map((entry) => entry.item.sourceId), ["a"]);
});

test("AI ranking artifact keeps all scores and marks only selected candidates", () => {
  const input: DraftInput = {
    schemaVersion: "v1", runId: "run-ranking", profileId: "default", profileVersion: "v1", status: "completed",
    generatedAt: "2026-09-04T01:00:00Z", templateId: "default", topics: ["AI"],
    selection: { candidateCount: 3, selectedCount: 3, maxItems: 50, requireTopicMatch: true }, items, failures: []
  };
  const scores = [
    { index: 0, score: 91, eventKey: "major-launch", reason: "Material launch" },
    { index: 1, score: 84, eventKey: "major-launch", reason: "Secondary coverage" },
    { index: 2, score: 42, eventKey: "minor-tutorial", reason: "Tutorial" }
  ];
  const selected = selectAiRankedItems(items, scores, 70, 15);
  const artifact = createAiRankingArtifact({ input, model: "model-x", generatedAt: "2026-09-04T02:00:00Z", minimumScore: 70, maxItems: 15, scores, selected });
  assert.equal(artifact.selectedCount, 1);
  assert.deepEqual(artifact.scores.map((entry) => entry.selected), [true, false, false]);
  assert.equal(artifact.scores[0]?.url, "https://example.com/a");
});
