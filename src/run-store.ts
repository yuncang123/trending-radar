import type { DataAdapter } from "obsidian";
import type { AiRankingArtifact } from "./ai-ranking.js";
import type { DraftInput, NormalizedItem, RunLease, RunLedger, SourceFailure, WriterOutput } from "./types.js";

export const LEASE_TTL_MS = 30_000;

function parseJson<T>(raw: string): T {
  return JSON.parse(raw.replace(/^\uFEFF/, "")) as T;
}

export class LeaseHeldError extends Error {
  constructor(public readonly lease: RunLease) {
    super(`Another Trending Radar run is active (${lease.runId}).`);
    this.name = "LeaseHeldError";
  }
}

function joinPath(...parts: string[]): string {
  return parts.map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

export class VaultLedgerStore {
  constructor(private readonly adapter: DataAdapter, private readonly outputDirectory: string) {}

  private runDirectory(runId: string): string {
    return joinPath(this.outputDirectory, ".trending-radar", "runs", runId);
  }

  private metadataDirectory(): string {
    return joinPath(this.outputDirectory, ".trending-radar");
  }

  private leaseDirectory(): string {
    return joinPath(this.metadataDirectory(), "lease");
  }

  private leasePath(): string {
    return joinPath(this.leaseDirectory(), "lease.json");
  }

  private async ensureDirectory(path: string): Promise<void> {
    let current = "";
    for (const part of path.split("/").filter(Boolean)) {
      current = joinPath(current, part);
      if (!(await this.adapter.exists(current))) await this.adapter.mkdir(current);
    }
  }

  async saveLedger(ledger: RunLedger): Promise<string> {
    const directory = this.runDirectory(ledger.runId);
    await this.ensureDirectory(directory);
    const path = joinPath(directory, "run.json");
    const data = `${JSON.stringify(ledger, null, 2)}\n`;
    if (await this.adapter.exists(path)) {
      await this.adapter.process(path, () => data);
    } else {
      const temporaryPath = `${path}.tmp`;
      await this.adapter.write(temporaryPath, data);
      await this.adapter.rename(temporaryPath, path);
    }
    return path;
  }

  async acquireLease(runId: string, ownerId: string, now = new Date().toISOString(), ttlMs = LEASE_TTL_MS): Promise<RunLease> {
    await this.ensureDirectory(this.metadataDirectory());
    const existingPath = this.leasePath();
    if (await this.adapter.exists(existingPath)) {
      const existing = await this.readLease();
      if (existing && new Date(existing.expiresAt).getTime() > Date.parse(now)) throw new LeaseHeldError(existing);
      await this.adapter.rmdir(this.leaseDirectory(), true);
    } else if (await this.adapter.exists(this.leaseDirectory())) {
      await this.adapter.rmdir(this.leaseDirectory(), true);
    }
    try {
      await this.adapter.mkdir(this.leaseDirectory());
    } catch {
      const existing = await this.readLease();
      if (existing) throw new LeaseHeldError(existing);
      throw new Error("Unable to acquire Trending Radar lease.");
    }
    const lease: RunLease = { runId, ownerId, acquiredAt: now, heartbeatAt: now, expiresAt: new Date(Date.parse(now) + ttlMs).toISOString() };
    await this.adapter.write(this.leasePath(), `${JSON.stringify(lease, null, 2)}\n`);
    return lease;
  }

  async refreshLease(lease: RunLease, now = new Date().toISOString(), ttlMs = LEASE_TTL_MS): Promise<RunLease> {
    const current = await this.readLease();
    if (!current || current.runId !== lease.runId || current.ownerId !== lease.ownerId) throw new Error("Trending Radar lease is no longer owned by this run.");
    const refreshed: RunLease = { ...current, heartbeatAt: now, expiresAt: new Date(Date.parse(now) + ttlMs).toISOString() };
    await this.adapter.process(this.leasePath(), () => `${JSON.stringify(refreshed, null, 2)}\n`);
    return refreshed;
  }

  async releaseLease(lease: RunLease): Promise<void> {
    const current = await this.readLease();
    if (current && current.runId === lease.runId && current.ownerId === lease.ownerId) await this.adapter.rmdir(this.leaseDirectory(), true);
  }

  private async readLease(): Promise<RunLease | undefined> {
    if (!(await this.adapter.exists(this.leasePath()))) return undefined;
    try {
      return JSON.parse(await this.adapter.read(this.leasePath())) as RunLease;
    } catch {
      return undefined;
    }
  }

  private async safeWrite(path: string, data: string): Promise<void> {
    if (await this.adapter.exists(path)) {
      await this.adapter.process(path, () => data);
      return;
    }
    const temporaryPath = `${path}.tmp`;
    await this.adapter.write(temporaryPath, data);
    await this.adapter.rename(temporaryPath, path);
  }

  async saveSourceItems(runId: string, sourceId: string, items: NormalizedItem[]): Promise<string> {
    const directory = joinPath(this.runDirectory(runId), "sources");
    await this.ensureDirectory(directory);
    const path = joinPath(directory, `${sourceId}.json`);
    await this.safeWrite(path, `${JSON.stringify(items, null, 2)}\n`);
    return path;
  }

  async loadSourceItems(path: string | null): Promise<NormalizedItem[]> {
    if (!path || !(await this.adapter.exists(path))) return [];
    const parsed = JSON.parse(await this.adapter.read(path)) as unknown;
    return Array.isArray(parsed) ? parsed as NormalizedItem[] : [];
  }

  async saveFailures(runId: string, failures: SourceFailure[]): Promise<string> {
    const directory = this.runDirectory(runId);
    await this.ensureDirectory(directory);
    const path = joinPath(directory, "failures.json");
    await this.safeWrite(path, `${JSON.stringify(failures, null, 2)}\n`);
    return path;
  }

  async saveDraftInput(runId: string, input: DraftInput): Promise<string> {
    const directory = this.runDirectory(runId);
    await this.ensureDirectory(directory);
    const path = joinPath(directory, "draft-input.json");
    await this.safeWrite(path, `${JSON.stringify(input, null, 2)}\n`);
    return path;
  }

  async loadDraftInput(runId: string): Promise<DraftInput | undefined> {
    const path = joinPath(this.runDirectory(runId), "draft-input.json");
    if (!(await this.adapter.exists(path))) return undefined;
    try {
      return parseJson<DraftInput>(await this.adapter.read(path));
    } catch {
      return undefined;
    }
  }

  async loadWriterOutput(runId: string): Promise<WriterOutput | undefined> {
    const path = joinPath(this.runDirectory(runId), "writer-output.json");
    if (!(await this.adapter.exists(path))) return undefined;
    try {
      return parseJson<WriterOutput>(await this.adapter.read(path));
    } catch {
      return undefined;
    }
  }

  async saveWriterOutput(runId: string, output: WriterOutput): Promise<string> {
    const directory = this.runDirectory(runId);
    await this.ensureDirectory(directory);
    const path = joinPath(directory, "writer-output.json");
    await this.safeWrite(path, `${JSON.stringify(output, null, 2)}\n`);
    return path;
  }

  async saveAiRanking(runId: string, ranking: AiRankingArtifact): Promise<string> {
    const directory = this.runDirectory(runId);
    await this.ensureDirectory(directory);
    const path = joinPath(directory, "ai-ranking.json");
    await this.safeWrite(path, `${JSON.stringify(ranking, null, 2)}\n`);
    return path;
  }

  async saveDailyDraft(date: string, markdown: string): Promise<string> {
    await this.ensureDirectory(this.outputDirectory);
    const path = joinPath(this.outputDirectory, `Trending Radar ${date}.md`);
    await this.safeWrite(path, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
    return path;
  }

  async loadLatestLedger(): Promise<RunLedger | undefined> {
    const runsDirectory = joinPath(this.outputDirectory, ".trending-radar", "runs");
    if (!(await this.adapter.exists(runsDirectory))) return undefined;
    const listed = await this.adapter.list(runsDirectory);
    const runIds = listed.folders.map((folder) => folder.split("/").filter(Boolean).pop() ?? "").filter(Boolean).sort().reverse();
    for (const runId of runIds) {
      const ledger = await this.loadLedger(runId);
      if (ledger) return ledger;
    }
    return undefined;
  }

  async loadLedger(runId: string): Promise<RunLedger | undefined> {
    const path = joinPath(this.runDirectory(runId), "run.json");
    if (!(await this.adapter.exists(path))) return undefined;
    const parsed = JSON.parse(await this.adapter.read(path)) as Omit<RunLedger, "schemaVersion"> & { schemaVersion?: string; lease?: RunLease | null };
    if (parsed.schemaVersion === "v1") return { ...parsed, schemaVersion: "v2", lease: null } as RunLedger;
    return { ...parsed, schemaVersion: "v2", lease: parsed.lease ?? null } as RunLedger;
  }
}
