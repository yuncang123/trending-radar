import { normalizeItem } from "../normalize.js";
import type { FetchContext, SourceAdapter, SourceBatch, SourceConfig, SourceFailure } from "../types.js";
import { cancelled, errorFailure, failure, httpFailure } from "./shared.js";

interface GitHubRepository {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  updated_at: string;
  stargazers_count?: number;
  forks_count?: number;
  owner?: { login?: string };
}

const SORTS = new Set(["stars", "forks", "help-wanted-issues", "updated"]);

export class GitHubAdapter implements SourceAdapter {
  readonly kind = "github" as const;
  readonly adapterVersion = "v1";
  readonly parserVersion = "github-rest-v2022-11-28";

  async fetch(source: SourceConfig, context: FetchContext): Promise<SourceBatch | SourceFailure> {
    const query = typeof source.query === "string" ? source.query.trim() : "";
    if (!query) return failure(source.sourceId, "verify", "MISSING_QUERY", "GitHub source.query is required.", false, context.now());
    const sort = typeof source.sort === "string" && SORTS.has(source.sort) ? source.sort : "updated";
    const order = source.order === "asc" ? "asc" : "desc";
    const pages = Math.min(Math.max(Number(source.pages) || 1, 1), 3);
    const perPage = Math.min(Math.max(Number(source.limit) || 30, 1), 100);
    const retrievedAt = context.now();
    const repositories: GitHubRepository[] = [];
    try {
      for (let page = 1; page <= pages; page += 1) {
        const cancelledNow = cancelled(source.sourceId, context);
        if (cancelledNow) return cancelledNow;
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&order=${order}&per_page=${perPage}&page=${page}`;
        const response = await context.request(url, { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });
        const statusFailure = httpFailure(source.sourceId, response, context.now());
        if (statusFailure) return statusFailure;
        let payload: { items?: GitHubRepository[] };
        try {
          payload = JSON.parse(response.text) as { items?: GitHubRepository[] };
        } catch {
          return failure(source.sourceId, "parse", "INVALID_JSON", "GitHub returned invalid JSON.", false, context.now());
        }
        const pageItems = Array.isArray(payload.items) ? payload.items : [];
        repositories.push(...pageItems);
        if (pageItems.length < perPage) break;
      }
      const verification = { reachable: true, status: 200, sourceRef: "https://api.github.com/search/repositories", checkedAt: retrievedAt, parserVersion: this.parserVersion };
      let droppedCount = 0;
      const items = repositories.flatMap((repository) => {
        const item = normalizeItem({
          sourceId: source.sourceId,
          sourceKind: this.kind,
          title: repository.full_name,
          url: repository.html_url,
          externalId: repository.id,
          publishedAt: repository.updated_at,
          author: repository.owner?.login ?? null,
          excerpt: repository.description,
          signals: { stars: repository.stargazers_count, forks: repository.forks_count },
          retrievedAt,
          parserVersion: this.parserVersion,
          verification
        });
        if (!item) droppedCount += 1;
        return item ? [item] : [];
      });
      if (items.length === 0) return failure(source.sourceId, "verify", "EMPTY_RESULT", `GitHub returned no usable repositories; dropped ${droppedCount}.`, false, retrievedAt);
      return { ok: true, sourceId: source.sourceId, items, droppedCount, retrievedAt };
    } catch (error) {
      return cancelled(source.sourceId, context) ?? errorFailure(source.sourceId, error, context.now());
    }
  }
}
