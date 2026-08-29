import Parser from "rss-parser";
import { assertPublicHttpUrl, normalizeItem } from "../normalize.js";
import type { FetchContext, SourceAdapter, SourceBatch, SourceConfig, SourceFailure, SourceKind } from "../types.js";
import { cancelled, errorFailure, failure, httpFailure } from "./shared.js";

export class RssAdapter implements SourceAdapter {
  readonly adapterVersion = "v1";
  readonly parserVersion = "rss-parser-3.13.0";

  constructor(readonly kind: Extract<SourceKind, "rss" | "rsshub-compatible"> = "rss") {}

  async fetch(source: SourceConfig, context: FetchContext): Promise<SourceBatch | SourceFailure> {
    const cancelledBefore = cancelled(source.sourceId, context);
    if (cancelledBefore) return cancelledBefore;
    const fallback = this.kind === "rsshub-compatible" ? "Check the configured route or use a self-hosted RSSHub-compatible provider." : undefined;
    let url: string;
    try {
      url = assertPublicHttpUrl(source.url, "source.url");
    } catch (error) {
      return failure(source.sourceId, "verify", "INVALID_URL", error instanceof Error ? error.message : String(error), false, context.now(), fallback);
    }
    try {
      const response = await context.request(url);
      const retrievedAt = context.now();
      const statusFailure = httpFailure(source.sourceId, response, retrievedAt, fallback);
      if (statusFailure) return statusFailure;
      const cancelledAfter = cancelled(source.sourceId, context);
      if (cancelledAfter) return cancelledAfter;
      let feed: Awaited<ReturnType<Parser["parseString"]>>;
      try {
        feed = await new Parser().parseString(response.text);
      } catch (error) {
        return failure(source.sourceId, "parse", "INVALID_FEED", error instanceof Error ? error.message : String(error), false, retrievedAt, fallback);
      }
      const verification = { reachable: true, status: response.status, sourceRef: url, checkedAt: retrievedAt, parserVersion: this.parserVersion };
      const requestedLimit = Number(source.limit);
      const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : undefined;
      let droppedCount = 0;
      const items = (limit ? feed.items.slice(0, limit) : feed.items).flatMap((item) => {
        const normalized = normalizeItem({
          sourceId: source.sourceId,
          sourceKind: this.kind,
          title: item.title,
          url: item.link,
          externalId: item.guid ?? item.id ?? null,
          publishedAt: item.isoDate ?? item.pubDate ?? null,
          author: item.creator ?? null,
          excerpt: item.contentSnippet ?? item.summary ?? item.content ?? "",
          retrievedAt,
          parserVersion: this.parserVersion,
          verification
        });
        if (!normalized) droppedCount += 1;
        return normalized ? [normalized] : [];
      });
      if (items.length === 0) return failure(source.sourceId, "verify", "EMPTY_RESULT", `Source returned no usable items; dropped ${droppedCount}.`, false, retrievedAt, fallback);
      return { ok: true, sourceId: source.sourceId, items, droppedCount, retrievedAt };
    } catch (error) {
      return cancelled(source.sourceId, context) ?? errorFailure(source.sourceId, error, context.now(), fallback);
    }
  }
}
