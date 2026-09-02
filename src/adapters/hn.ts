import { normalizeItem } from "../normalize.js";
import type { FetchContext, SourceAdapter, SourceBatch, SourceConfig, SourceFailure } from "../types.js";
import { cancelled, errorFailure, failure, httpFailure } from "./shared.js";

interface HnItem { id: number; title?: string; url?: string; by?: string; time?: number; text?: string; type?: string; score?: number; descendants?: number }
interface AlgoliaHit { objectID?: string; title?: string; url?: string | null; author?: string; created_at?: string; story_text?: string | null; points?: number | null; num_comments?: number | null }

const MODES = new Set(["topstories", "newstories", "beststories", "askstories", "showstories"]);
const ALGOLIA_BASE = "https://hn.algolia.com/api/v1/search";

export class HackerNewsAdapter implements SourceAdapter {
  readonly kind = "hn" as const;
  readonly adapterVersion = "v2";
  readonly parserVersion = "hn-algolia-v1+firebase-v0";

  async fetch(source: SourceConfig, context: FetchContext): Promise<SourceBatch | SourceFailure> {
    const mode = typeof source.mode === "string" && MODES.has(source.mode) ? source.mode : "topstories";
    const limit = Math.min(Math.max(Number(source.limit) || 30, 1), 100);
    if (mode === "topstories") {
      const algolia = await this.fetchAlgoliaFrontPage(source, limit, context);
      if (algolia.ok || algolia.code === "CANCELLED") return algolia;
    }
    return this.fetchFirebase(source, mode, limit, context);
  }

  private async fetchAlgoliaFrontPage(source: SourceConfig, limit: number, context: FetchContext): Promise<SourceBatch | SourceFailure> {
    const url = `${ALGOLIA_BASE}?tags=front_page&hitsPerPage=${limit}`;
    try {
      const response = await context.request(url);
      const responseFailure = httpFailure(source.sourceId, response, context.now(), "Firebase fallback will be attempted.");
      if (responseFailure) return responseFailure;
      let hits: AlgoliaHit[];
      try {
        const parsed = JSON.parse(response.text) as { hits?: unknown };
        hits = Array.isArray(parsed.hits) ? parsed.hits as AlgoliaHit[] : [];
      } catch {
        return failure(source.sourceId, "parse", "INVALID_JSON", "Algolia HN API returned invalid JSON.", true, context.now(), "Firebase fallback will be attempted.");
      }
      const retrievedAt = context.now();
      const verification = { reachable: true, status: 200, sourceRef: url, checkedAt: retrievedAt, parserVersion: this.parserVersion };
      let droppedCount = 0;
      const items = [];
      for (const hit of hits) {
        const id = typeof hit.objectID === "string" ? hit.objectID : "";
        const facts = [
          typeof hit.points === "number" ? `${hit.points} points` : "",
          typeof hit.num_comments === "number" ? `${hit.num_comments} comments` : ""
        ].filter(Boolean).join("; ");
        const item = normalizeItem({
          sourceId: source.sourceId,
          sourceKind: this.kind,
          title: hit.title,
          url: hit.url ?? (id ? `https://news.ycombinator.com/item?id=${id}` : undefined),
          externalId: id || null,
          publishedAt: hit.created_at ?? null,
          author: hit.author ?? null,
          excerpt: hit.story_text ?? facts,
          signals: { points: hit.points ?? undefined, comments: hit.num_comments ?? undefined },
          retrievedAt,
          parserVersion: this.parserVersion,
          verification
        });
        if (item) items.push(item); else droppedCount += 1;
      }
      if (items.length === 0) return failure(source.sourceId, "verify", "EMPTY_RESULT", `Algolia HN API returned no usable stories; dropped ${droppedCount}.`, true, retrievedAt, "Firebase fallback will be attempted.");
      return { ok: true, sourceId: source.sourceId, items, droppedCount, retrievedAt };
    } catch (error) {
      return cancelled(source.sourceId, context) ?? errorFailure(source.sourceId, error, context.now(), "Firebase fallback will be attempted.");
    }
  }

  private async fetchFirebase(source: SourceConfig, mode: string, limit: number, context: FetchContext): Promise<SourceBatch | SourceFailure> {
    const base = "https://hacker-news.firebaseio.com/v0";
    try {
      const listResponse = await context.request(`${base}/${mode}.json`);
      const listFailure = httpFailure(source.sourceId, listResponse, context.now());
      if (listFailure) return listFailure;
      let ids: number[];
      try {
        const parsed = JSON.parse(listResponse.text) as unknown;
        ids = Array.isArray(parsed) ? parsed.filter((id): id is number => Number.isInteger(id)).slice(0, limit) : [];
      } catch {
        return failure(source.sourceId, "parse", "INVALID_JSON", "Hacker News returned an invalid story list.", false, context.now());
      }
      const retrievedAt = context.now();
      const verification = { reachable: true, status: 200, sourceRef: `${base}/${mode}.json`, checkedAt: retrievedAt, parserVersion: this.parserVersion };
      let droppedCount = 0;
      const items = [];
      for (const id of ids) {
        const cancelledNow = cancelled(source.sourceId, context);
        if (cancelledNow) return cancelledNow;
        const response = await context.request(`${base}/item/${id}.json`);
        const statusFailure = httpFailure(source.sourceId, response, context.now());
        if (statusFailure) return statusFailure;
        let value: HnItem | null;
        try {
          value = JSON.parse(response.text) as HnItem | null;
        } catch {
          return failure(source.sourceId, "parse", "INVALID_JSON", `Hacker News item ${id} returned invalid JSON.`, false, context.now());
        }
        if (!value || value.type !== "story") { droppedCount += 1; continue; }
        const item = normalizeItem({
          sourceId: source.sourceId,
          sourceKind: this.kind,
          title: value.title,
          url: value.url ?? `https://news.ycombinator.com/item?id=${value.id}`,
          externalId: value.id,
          publishedAt: value.time ? new Date(value.time * 1000).toISOString() : null,
          author: value.by ?? null,
          excerpt: value.text ?? "",
          signals: { points: value.score, comments: value.descendants },
          retrievedAt,
          parserVersion: this.parserVersion,
          verification
        });
        if (item) items.push(item); else droppedCount += 1;
      }
      if (items.length === 0) return failure(source.sourceId, "verify", "EMPTY_RESULT", `Hacker News returned no usable stories; dropped ${droppedCount}.`, false, retrievedAt);
      return { ok: true, sourceId: source.sourceId, items, droppedCount, retrievedAt };
    } catch (error) {
      return cancelled(source.sourceId, context) ?? errorFailure(source.sourceId, error, context.now());
    }
  }
}
