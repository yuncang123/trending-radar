import assert from "node:assert/strict";
import test from "node:test";
import { cancelRun, createRunLedger, finalizeRunStatus, markRunInterrupted, markSourceCancelled, markSourceFailed, markSourceRunning, markSourceSucceeded, sourcesToRun } from "../src/ledger.js";
import type { Profile } from "../src/types.js";

const profile: Profile = {
  profileId: "default",
  version: "v1",
  outputDirectory: "Trending Radar",
  sources: [
    { sourceId: "rss-a", kind: "rss", enabled: true },
    { sourceId: "hn", kind: "hn", enabled: true },
    { sourceId: "disabled", kind: "url", enabled: false }
  ],
  topics: ["software"],
  filter: {},
  templateId: "default"
};

test("zero enabled sources is failed rather than an empty successful run", () => {
  const zero = { ...profile, sources: [] };
  assert.equal(finalizeRunStatus(createRunLedger(zero, "run-zero")).status, "failed");
});

test("a successful source plus a failed source is partial", () => {
  let ledger = createRunLedger(profile, "run-partial");
  ledger = markSourceSucceeded(ledger, "rss-a", "sources/rss-a.json");
  ledger = markSourceFailed(ledger, "hn", "fetch", "HTTP_503", "upstream unavailable");
  assert.equal(finalizeRunStatus(ledger).status, "partial");
});

test("resume skips only version-matching successful sources", () => {
  let previous = createRunLedger(profile, "run-previous", "2026-08-28T00:00:00Z", {
    "rss-a": { adapterVersion: "rss-v2", parserVersion: "parser-v3" },
    hn: { adapterVersion: "v2", parserVersion: "v1" }
  });
  previous = markSourceSucceeded(previous, "rss-a", "sources/rss-a.json");
  previous = markSourceFailed(previous, "hn", "parse", "INVALID_FEED", "bad feed");
  assert.deepEqual(sourcesToRun(previous, profile, {
    "rss-a": { adapterVersion: "rss-v2", parserVersion: "parser-v3" },
    hn: { adapterVersion: "v2", parserVersion: "v1" }
  }), ["hn"]);
});

test("run ledger records current adapter and parser versions", () => {
  const ledger = createRunLedger(profile, "run-versions", "2026-08-28T00:00:00Z", {
    "rss-a": { adapterVersion: "rss-v2", parserVersion: "parser-v3" }
  });
  assert.equal(ledger.sources["rss-a"]?.adapterVersion, "rss-v2");
  assert.equal(ledger.sources["rss-a"]?.parserVersion, "parser-v3");
});

test("resume reruns running and cancelled sources and profile-version changes", () => {
  let previous = createRunLedger(profile, "run-previous");
  previous = markSourceRunning(previous, "rss-a");
  previous = markSourceCancelled(previous, "hn");
  const versions = {
    "rss-a": { adapterVersion: "v1", parserVersion: "v1" },
    hn: { adapterVersion: "v1", parserVersion: "v1" }
  };
  assert.deepEqual(sourcesToRun(previous, profile, versions), ["rss-a", "hn"]);
  assert.deepEqual(sourcesToRun(previous, { ...profile, version: "v2" }, versions), ["rss-a", "hn"]);
});

test("a cancellation request after all sources succeeded stays completed", () => {
  let ledger = createRunLedger({ ...profile, sources: [profile.sources[0]] }, "run-complete");
  ledger = markSourceSucceeded(ledger, "rss-a", "sources/rss-a.json");
  assert.equal(finalizeRunStatus(ledger, true).status, "completed");
});

test("cancelling before any source succeeds is explicit", () => {
  const cancelled = cancelRun(createRunLedger(profile, "run-cancelled"));
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(Object.values(cancelled.sources).map((source) => source.status), ["cancelled", "cancelled"]);
});

test("interrupted run preserves source results and marks the active source with a stable error", () => {
  let ledger = createRunLedger(profile, "run-interrupted", "2026-08-28T00:00:00Z");
  ledger = markSourceSucceeded(ledger, "rss-a", "sources/rss-a.json", "2026-08-28T00:00:01Z");
  ledger = markSourceRunning(ledger, "hn", "2026-08-28T00:00:02Z");
  const interrupted = markRunInterrupted(ledger, "lease expired", "2026-08-28T00:01:00Z");
  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.finishedAt, "2026-08-28T00:01:00Z");
  assert.equal(interrupted.sources["rss-a"]?.resultFile, "sources/rss-a.json");
  assert.equal(interrupted.sources.hn?.status, "running");
  assert.equal(interrupted.sources.hn?.error?.code, "INTERRUPTED");
  assert.deepEqual(sourcesToRun(interrupted, profile, { "rss-a": { adapterVersion: "v1", parserVersion: "v1" }, hn: { adapterVersion: "v1", parserVersion: "v1" } }), ["hn"]);
});
