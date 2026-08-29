import type { Profile, RunLedger, RunLease, SourceRun, SourceVersions } from "./types.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createRunLedger(profile: Profile, runId: string, now = new Date().toISOString(), versions: Record<string, SourceVersions> = {}): RunLedger {
  const sources: Record<string, SourceRun> = {};
  for (const source of profile.sources) {
    if (!source.enabled) continue;
    sources[source.sourceId] = {
      status: "pending",
      startedAt: null,
      finishedAt: null,
      resultFile: null,
      error: null,
      adapterVersion: versions[source.sourceId]?.adapterVersion ?? "v1",
      parserVersion: versions[source.sourceId]?.parserVersion ?? "v1"
    };
  }
  return {
    schemaVersion: "v2",
    runId,
    profileId: profile.profileId,
    profileVersion: profile.version,
    status: "running",
    startedAt: now,
    finishedAt: null,
    cancelRequested: false,
    lease: null,
    sources
  };
}

export function attachLease(ledger: RunLedger, lease: RunLease): RunLedger {
  return { ...clone(ledger), lease };
}

export function heartbeat(ledger: RunLedger, lease: RunLease): RunLedger {
  return { ...clone(ledger), lease };
}

export function markRunInterrupted(ledger: RunLedger, message = "Run interrupted because its lease expired.", now = new Date().toISOString()): RunLedger {
  const next = clone(ledger);
  next.status = "interrupted";
  next.finishedAt = now;
  next.lease = null;
  for (const source of Object.values(next.sources)) {
    if (source.status === "running" && !source.error) {
      source.error = { stage: "fetch", code: "INTERRUPTED", message };
    }
  }
  return next;
}

function updateSource(ledger: RunLedger, sourceId: string, update: Partial<SourceRun>, now: string): RunLedger {
  const next = clone(ledger);
  const source = next.sources[sourceId];
  if (!source) throw new Error(`unknown sourceId: ${sourceId}`);
  next.sources[sourceId] = { ...source, ...update, finishedAt: update.status && update.status !== "running" ? now : source.finishedAt };
  return next;
}

export function markSourceRunning(ledger: RunLedger, sourceId: string, now = new Date().toISOString()): RunLedger {
  return updateSource(ledger, sourceId, { status: "running", startedAt: now, error: null }, now);
}

export function markSourceSucceeded(ledger: RunLedger, sourceId: string, resultFile: string, now = new Date().toISOString()): RunLedger {
  return updateSource(ledger, sourceId, { status: "succeeded", resultFile, error: null }, now);
}

export function markSourceFailed(ledger: RunLedger, sourceId: string, stage: string, code: string, message: string, now = new Date().toISOString()): RunLedger {
  return updateSource(ledger, sourceId, { status: "failed", error: { stage, code, message } }, now);
}

export function markSourceCancelled(ledger: RunLedger, sourceId: string, message = "cancelled", now = new Date().toISOString()): RunLedger {
  return updateSource(ledger, sourceId, { status: "cancelled", error: { stage: "cancel", code: "CANCELLED", message } }, now);
}

export function cancelRun(ledger: RunLedger, message = "cancelled by user", now = new Date().toISOString()): RunLedger {
  let next = clone(ledger);
  next.cancelRequested = true;
  for (const [sourceId, source] of Object.entries(next.sources)) {
    if (source.status === "pending" || source.status === "running") {
      next = markSourceCancelled(next, sourceId, message, now);
    }
  }
  return finalizeRunStatus(next, true, now);
}

export function finalizeRunStatus(ledger: RunLedger, cancelRequested = ledger.cancelRequested, now = new Date().toISOString()): RunLedger {
  const next = clone(ledger);
  next.cancelRequested = cancelRequested;
  next.lease = null;
  next.finishedAt = now;
  const statuses = Object.values(next.sources).map((source) => source.status);
  const successes = statuses.filter((status) => status === "succeeded").length;
  const failures = statuses.filter((status) => status === "failed").length;
  const cancelled = statuses.filter((status) => status === "cancelled").length;
  if (successes > 0 && (failures > 0 || cancelled > 0)) next.status = "partial";
  else if (successes > 0) next.status = "completed";
  else if (cancelRequested || cancelled > 0) next.status = "cancelled";
  else next.status = "failed";
  return next;
}

export function sourcesToRun(previous: RunLedger | undefined, profile: Profile, currentVersions: Record<string, SourceVersions>): string[] {
  if (!previous || previous.profileId !== profile.profileId || previous.profileVersion !== profile.version) {
    return profile.sources.filter((source) => source.enabled).map((source) => source.sourceId);
  }
  return profile.sources.filter((source) => {
    if (!source.enabled) return false;
    const prior = previous?.sources[source.sourceId];
    const current = currentVersions[source.sourceId] ?? { adapterVersion: "v1", parserVersion: "v1" };
    return !(prior?.status === "succeeded" && prior.adapterVersion === current.adapterVersion && prior.parserVersion === current.parserVersion);
  }).map((source) => source.sourceId);
}

export function carryForwardReusableSources(ledger: RunLedger, previous: RunLedger | undefined, profile: Profile, currentVersions: Record<string, SourceVersions>): RunLedger {
  if (!previous) return ledger;
  const rerun = new Set(sourcesToRun(previous, profile, currentVersions));
  const next = clone(ledger);
  for (const source of profile.sources) {
    if (!source.enabled || rerun.has(source.sourceId)) continue;
    const prior = previous.sources[source.sourceId];
    if (prior) next.sources[source.sourceId] = clone(prior);
  }
  return next;
}
