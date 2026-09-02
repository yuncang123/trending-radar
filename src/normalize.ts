import { createHash } from "node:crypto";
import type { NormalizedItem, SourceKind, TrendSignals, Verification } from "./types.js";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);
const MAX_EXCERPT_LENGTH = 500;
const PLACEHOLDER_EXCERPT = /^(?:点击查看原文[>＞]?|查看全文|comments?)$/i;

export interface RawItem {
  sourceId: string;
  sourceKind: SourceKind;
  title?: string | null;
  url?: string | null;
  externalId?: string | number | null;
  publishedAt?: string | null;
  author?: string | null;
  excerpt?: string | null;
  retrievedAt: string;
  parserVersion: string;
  verification: Verification;
  signals?: TrendSignals;
}

function inferPublishedAt(value: string | null | undefined, url: string): string | null {
  if (value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  const match = url.match(/(?:^|\/)((?:20|19)\d{2})[\/-](\d{1,2})[\/-](\d{1,2})(?:[\/?#]|$)/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const inferred = new Date(Date.UTC(year, month - 1, day));
  return inferred.getUTCFullYear() === year && inferred.getUTCMonth() === month - 1 && inferred.getUTCDate() === day
    ? inferred.toISOString()
    : null;
}

function normalizeSignals(value: TrendSignals | undefined): TrendSignals | undefined {
  if (!value) return undefined;
  const signals = Object.fromEntries((Object.entries(value) as [keyof TrendSignals, unknown][])
    .filter(([, entry]) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0)
    .map(([key, entry]) => [key, Math.round(entry as number)])) as TrendSignals;
  return Object.keys(signals).length > 0 ? signals : undefined;
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}

export function compactText(value: string | null | undefined, maxLength = MAX_EXCERPT_LENGTH): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function isLowQualityExcerpt(value: string | null | undefined): boolean {
  const compact = compactText(value);
  return compact.length === 0 || PLACEHOLDER_EXCERPT.test(compact);
}

export function normalizeItem(raw: RawItem): NormalizedItem | undefined {
  const title = compactText(raw.title, 300);
  if (!title || !raw.url) return undefined;
  let url: string;
  try {
    url = canonicalizeUrl(raw.url);
  } catch {
    return undefined;
  }
  const excerpt = compactText(raw.excerpt);
  const contentHash = createHash("sha256").update(`${title}\n${url}\n${excerpt}`).digest("hex");
  const signals = normalizeSignals(raw.signals);
  return {
    sourceId: raw.sourceId,
    sourceKind: raw.sourceKind,
    title,
    url,
    externalId: raw.externalId === null || raw.externalId === undefined ? null : String(raw.externalId),
    publishedAt: inferPublishedAt(raw.publishedAt, url),
    author: raw.author ? compactText(raw.author, 200) : null,
    excerpt,
    contentHash,
    retrievedAt: raw.retrievedAt,
    parserVersion: raw.parserVersion,
    verification: raw.verification,
    ...(signals ? { signals } : {})
  };
}

export function deduplicateItems(items: NormalizedItem[]): NormalizedItem[] {
  const externalIds = new Set<string>();
  const urls = new Set<string>();
  const hashes = new Set<string>();
  return items.filter((item) => {
    const externalKey = item.externalId ? `${item.sourceId}:${item.externalId}` : null;
    if ((externalKey && externalIds.has(externalKey)) || urls.has(item.url) || hashes.has(item.contentHash)) return false;
    if (externalKey) externalIds.add(externalKey);
    urls.add(item.url);
    hashes.add(item.contentHash);
    return true;
  });
}

export function replaceSourceItems(items: NormalizedItem[], sourceId: string, replacement: NormalizedItem[]): NormalizedItem[] {
  return deduplicateItems([...items.filter((item) => item.sourceId !== sourceId), ...replacement]);
}

export function assertPublicHttpUrl(value: unknown, field = "url"): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a public HTTP URL`);
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error(`${field} must be a public HTTP URL`);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateNetworkHost(host)) throw new Error(`${field} must not target localhost or a private network`);
  return url.toString();
}

export function isPrivateNetworkHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isPrivateNetworkHost(normalized.slice(7));
  return normalized === "localhost" || normalized === "0.0.0.0" || normalized === "::" || normalized === "::1" || normalized.endsWith(".local") || normalized.endsWith(".internal") || /^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized) || /^169\.254\./.test(normalized) || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized) || /^(?:fc|fd)[0-9a-f]{2}:|^fe[89ab][0-9a-f]:/i.test(normalized);
}
