import { Readability } from "@mozilla/readability";
import { assertPublicHttpUrl, normalizeItem } from "../normalize.js";
import type { FetchContext, SourceAdapter, SourceBatch, SourceConfig, SourceFailure } from "../types.js";
import { cancelled, errorFailure, failure, httpFailure } from "./shared.js";

export class UrlAdapter implements SourceAdapter {
  readonly kind = "url" as const;
  readonly adapterVersion = "v1";
  readonly parserVersion = "readability-0.6.0";

  async fetch(source: SourceConfig, context: FetchContext): Promise<SourceBatch | SourceFailure> {
    const cancelledBefore = cancelled(source.sourceId, context);
    if (cancelledBefore) return cancelledBefore;
    let url: string;
    try {
      url = assertPublicHttpUrl(source.url, "source.url");
    } catch (error) {
      return failure(source.sourceId, "verify", "INVALID_URL", error instanceof Error ? error.message : String(error), false, context.now());
    }
    try {
      const response = await context.request(url);
      const retrievedAt = context.now();
      const statusFailure = httpFailure(source.sourceId, response, retrievedAt);
      if (statusFailure) return statusFailure;
      const cancelledAfter = cancelled(source.sourceId, context);
      if (cancelledAfter) return cancelledAfter;
      try {
        const parseHtml = context.parseHtml ?? ((html: string) => new DOMParser().parseFromString(html, "text/html"));
        const document = parseHtml(response.text);
        const article = new Readability(document.cloneNode(true) as Document).parse();
        const normalized = normalizeItem({
          sourceId: source.sourceId,
          sourceKind: this.kind,
          title: article?.title ?? document.title,
          url,
          publishedAt: article?.publishedTime ?? null,
          author: article?.byline ?? null,
          excerpt: article?.textContent ?? "",
          retrievedAt,
          parserVersion: this.parserVersion,
          verification: { reachable: true, status: response.status, sourceRef: url, checkedAt: retrievedAt, parserVersion: this.parserVersion }
        });
        if (!normalized || !normalized.excerpt) return failure(source.sourceId, "parse", "CONTENT_UNAVAILABLE", "Readable public article content was not found; the page may require login or block extraction.", false, retrievedAt);
        return { ok: true, sourceId: source.sourceId, items: [normalized], droppedCount: 0, retrievedAt };
      } catch (error) {
        return failure(source.sourceId, "parse", "INVALID_HTML", error instanceof Error ? error.message : String(error), false, retrievedAt);
      }
    } catch (error) {
      return cancelled(source.sourceId, context) ?? errorFailure(source.sourceId, error, context.now());
    }
  }
}
