import type { FailureStage, FetchContext, HttpResponse, SourceFailure } from "../types.js";

export function failure(sourceId: string, stage: FailureStage, code: string, message: string, retryable: boolean, retrievedAt: string, fallback?: string): SourceFailure {
  return { ok: false, sourceId, stage, code, message, retryable, retrievedAt, ...(fallback ? { fallback } : {}) };
}

export function cancelled(sourceId: string, context: FetchContext): SourceFailure | undefined {
  return context.signal.aborted ? failure(sourceId, "cancel", "CANCELLED", "Source fetch cancelled by user.", false, context.now()) : undefined;
}

export function httpFailure(sourceId: string, response: HttpResponse, retrievedAt: string, fallback?: string): SourceFailure | undefined {
  if (response.status >= 200 && response.status < 300) return undefined;
  if (response.status === 401 || response.status === 403) return failure(sourceId, "fetch", "ACCESS_DENIED", `Source returned HTTP ${response.status}.`, false, retrievedAt, fallback);
  if (response.status === 429) return failure(sourceId, "fetch", "RATE_LIMITED", "Source rate limit reached (HTTP 429).", true, retrievedAt, fallback);
  return failure(sourceId, "fetch", `HTTP_${response.status}`, `Source returned HTTP ${response.status}.`, response.status >= 500, retrievedAt, fallback);
}

export function errorFailure(sourceId: string, error: unknown, retrievedAt: string, fallback?: string): SourceFailure {
  const message = error instanceof Error ? error.message : String(error);
  const timeout = /timeout|timed out|abort/i.test(message);
  return failure(sourceId, "fetch", timeout ? "TIMEOUT" : "NETWORK_ERROR", message, true, retrievedAt, fallback);
}
