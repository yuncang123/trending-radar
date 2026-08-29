import assert from "node:assert/strict";
import test from "node:test";
import type { DataAdapter } from "obsidian";
import { LeaseHeldError, VaultLedgerStore } from "../src/run-store.js";
import type { NormalizedItem } from "../src/types.js";

class MemoryAdapter {
  files = new Map<string, string>();
  directories = new Set<string>();
  async exists(path: string) { return this.files.has(path) || this.directories.has(path); }
  async mkdir(path: string) { if (this.directories.has(path)) throw new Error("already exists"); this.directories.add(path); }
  async write(path: string, data: string) { this.files.set(path, data); }
  async read(path: string) { const value = this.files.get(path); if (value === undefined) throw new Error("missing"); return value; }
  async process(path: string, fn: (data: string) => string) { const value = fn(await this.read(path)); this.files.set(path, value); return value; }
  async rename(from: string, to: string) { const value = await this.read(from); this.files.delete(from); this.files.set(to, value); }
  async rmdir(path: string, recursive: boolean) {
    for (const directory of [...this.directories]) if (directory === path || (recursive && directory.startsWith(`${path}/`))) this.directories.delete(directory);
    for (const file of [...this.files.keys()]) if (file.startsWith(`${path}/`)) this.files.delete(file);
  }
  async list(path: string) {
    const prefix = `${path}/`;
    const folders = [...this.directories].filter((entry) => entry.startsWith(prefix) && !entry.slice(prefix.length).includes("/"));
    return { files: [], folders };
  }
}

const item: NormalizedItem = {
  sourceId: "rss-a", sourceKind: "rss", title: "Item", url: "https://example.com/item", externalId: "1", publishedAt: null, author: null, excerpt: "excerpt", contentHash: "hash", retrievedAt: "2026-08-28T00:00:00Z", parserVersion: "v1",
  verification: { reachable: true, status: 200, sourceRef: "fixture", checkedAt: "2026-08-28T00:00:00Z", parserVersion: "v1" }
};

test("source items can be safely saved, overwritten, and replayed by source ID", async () => {
  const adapter = new MemoryAdapter();
  const store = new VaultLedgerStore(adapter as unknown as DataAdapter, "Trending Radar");
  const path = await store.saveSourceItems("run-1", "rss-a", [item]);
  assert.deepEqual(await store.loadSourceItems(path), [item]);
  await store.saveSourceItems("run-1", "rss-a", [{ ...item, title: "Updated" }]);
  assert.equal((await store.loadSourceItems(path))[0]?.title, "Updated");
  assert.equal([...adapter.files.keys()].some((entry) => entry.endsWith(".tmp")), false);
});

test("lease rejects a second owner and can be reacquired after expiry", async () => {
  const adapter = new MemoryAdapter();
  const store = new VaultLedgerStore(adapter as unknown as DataAdapter, "Trending Radar");
  const first = await store.acquireLease("run-1", "owner-1", "2026-08-28T00:00:00.000Z", 30_000);
  await assert.rejects(() => store.acquireLease("run-2", "owner-2", "2026-08-28T00:00:10.000Z", 30_000), LeaseHeldError);
  const second = await store.acquireLease("run-2", "owner-2", "2026-08-28T00:00:31.000Z", 30_000);
  assert.equal(second.runId, "run-2");
  await store.releaseLease(second);
  assert.equal(await adapter.exists("Trending Radar/.trending-radar/lease"), false);
  assert.equal(first.ownerId, "owner-1");
});

test("lease heartbeat refreshes expiry for the owning run", async () => {
  const adapter = new MemoryAdapter();
  const store = new VaultLedgerStore(adapter as unknown as DataAdapter, "Trending Radar");
  const lease = await store.acquireLease("run-1", "owner-1", "2026-08-28T00:00:00.000Z", 30_000);
  const refreshed = await store.refreshLease(lease, "2026-08-28T00:00:10.000Z", 30_000);
  assert.equal(refreshed.heartbeatAt, "2026-08-28T00:00:10.000Z");
  assert.equal(refreshed.expiresAt, "2026-08-28T00:00:40.000Z");
});

test("v1 ledgers are migrated in memory without losing source data", async () => {
  const adapter = new MemoryAdapter();
  adapter.directories.add("Trending Radar/.trending-radar/runs/run-old");
  adapter.files.set("Trending Radar/.trending-radar/runs/run-old/run.json", JSON.stringify({
    schemaVersion: "v1", runId: "run-old", profileId: "default", profileVersion: "v1", status: "running",
    startedAt: "2026-08-28T00:00:00Z", finishedAt: null, cancelRequested: false,
    sources: { "rss-a": { status: "succeeded", startedAt: null, finishedAt: null, resultFile: "sources/rss-a.json", error: null, adapterVersion: "v1", parserVersion: "v1" } }
  }));
  const store = new VaultLedgerStore(adapter as unknown as DataAdapter, "Trending Radar");
  const ledger = await store.loadLedger("run-old");
  assert.equal(ledger?.schemaVersion, "v2");
  assert.equal(ledger?.lease, null);
  assert.equal(ledger?.sources["rss-a"]?.resultFile, "sources/rss-a.json");
});

test("draft input and external writer output are read from the same run directory", async () => {
  const adapter = new MemoryAdapter();
  adapter.directories.add("Trending Radar/.trending-radar/runs/run-writer");
  adapter.files.set("Trending Radar/.trending-radar/runs/run-writer/draft-input.json", JSON.stringify({ schemaVersion: "v1", runId: "run-writer" }));
  adapter.files.set("Trending Radar/.trending-radar/runs/run-writer/writer-output.json", `\uFEFF${JSON.stringify({ schemaVersion: "v1", markdown: "# draft" })}`);
  const store = new VaultLedgerStore(adapter as unknown as DataAdapter, "Trending Radar");
  assert.equal((await store.loadDraftInput("run-writer"))?.runId, "run-writer");
  assert.equal((await store.loadWriterOutput("run-writer"))?.markdown, "# draft");
  assert.equal(await store.loadWriterOutput("missing"), undefined);
});
