import test from "node:test";
import assert from "node:assert/strict";
import { availableTopicSuggestionGroups, TOPIC_SUGGESTION_GROUPS } from "../src/topic-suggestions.js";

function availableTopics(selectedTopics: readonly string[]): string[] {
  return availableTopicSuggestionGroups(selectedTopics).flatMap((group) => [...group.topics]);
}

test("selected suggestions are removed case-insensitively", () => {
  const available = availableTopics(["ai", "OPEN SOURCE", "机器人"]);
  assert.equal(available.includes("AI"), false);
  assert.equal(available.includes("open source"), false);
  assert.equal(available.includes("机器人"), false);
});

test("an unselected or deleted suggestion is available again", () => {
  assert.equal(availableTopics(["MCP"]).includes("MCP"), false);
  assert.equal(availableTopics([]).includes("MCP"), true);
});

test("custom selected topics do not affect curated suggestions", () => {
  assert.deepEqual(availableTopics(["量子计算"]), availableTopics([]));
});

test("filtering does not mutate the curated suggestion constants", () => {
  const before = JSON.stringify(TOPIC_SUGGESTION_GROUPS);
  const result = availableTopicSuggestionGroups(["Agent"]);
  (result[0]?.topics as string[] | undefined)?.reverse();
  assert.equal(JSON.stringify(TOPIC_SUGGESTION_GROUPS), before);
});
