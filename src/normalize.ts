import { createHash } from "node:crypto";
import type { NormalizedItem, SourceKind, Verification } from "./types.js";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);
const MAX_EXCERPT_LENGTH = 500;

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
  return {
    sourceId: raw.sourceId,
    sourceKind: raw.sourceKind,
    title,
    url,
    externalId: raw.externalId === null || raw.externalId === undefined ? null : String(raw.externalId),
    publishedAt: raw.publishedAt ?? null,
    author: raw.author ? compactText(raw.author, 200) : null,
    excerpt,
    contentHash,
    retrievedAt: raw.retrievedAt,
    parserVersion: raw.parserVersion,
    verification: raw.verification
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
