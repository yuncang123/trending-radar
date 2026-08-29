import type { SourceAdapter, SourceKind } from "../types.js";
import { GitHubAdapter } from "./github.js";
import { HackerNewsAdapter } from "./hn.js";
import { RssAdapter } from "./rss.js";
import { UrlAdapter } from "./url.js";

export function createAdapterRegistry(): Map<SourceKind, SourceAdapter> {
  const adapters: SourceAdapter[] = [new RssAdapter(), new UrlAdapter(), new GitHubAdapter(), new HackerNewsAdapter(), new RssAdapter("rsshub-compatible")];
  return new Map(adapters.map((adapter) => [adapter.kind, adapter]));
}
