export const SOURCE_KINDS = ["rss", "url", "github", "hn", "rsshub-compatible"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface SourceConfig {
  sourceId: string;
  kind: SourceKind;
  enabled: boolean;
  [key: string]: unknown;
}

export interface Profile {
  profileId: string;
  version: string;
  outputDirectory: string;
  sources: SourceConfig[];
  topics: string[];
  filter: Record<string, unknown>;
  templateId: string;
  writerId?: string;
}

export type OverallRunStatus = "running" | "completed" | "partial" | "failed" | "cancelled" | "interrupted";
export type SourceRunStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export interface SourceRun {
  status: SourceRunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  resultFile: string | null;
  error: { stage: string; code: string; message: string } | null;
  adapterVersion: string;
  parserVersion: string;
}

export interface RunLease {
  runId: string;
  ownerId: string;
  acquiredAt: string;
  heartbeatAt: string;
  expiresAt: string;
}

export interface RunLedger {
  schemaVersion: "v2";
  runId: string;
  profileId: string;
  profileVersion: string;
  status: OverallRunStatus;
  startedAt: string;
  finishedAt: string | null;
  cancelRequested: boolean;
  lease: RunLease | null;
  sources: Record<string, SourceRun>;
}

export interface SourceVersions {
  adapterVersion: string;
  parserVersion: string;
}

export type FailureStage = "fetch" | "parse" | "normalize" | "verify" | "cancel";

export interface Verification {
  reachable: boolean;
  status: number | null;
  sourceRef: string;
  checkedAt: string;
  parserVersion: string;
}

export interface NormalizedItem {
  sourceId: string;
  sourceKind: SourceKind;
  title: string;
  url: string;
  externalId: string | null;
  publishedAt: string | null;
  author: string | null;
  excerpt: string;
  contentHash: string;
  retrievedAt: string;
  parserVersion: string;
  verification: Verification;
  /** Optional source-native popularity signals preserved for downstream ranking and writing. */
  signals?: TrendSignals;
}

export interface TrendSignals {
  points?: number;
  comments?: number;
  stars?: number;
  forks?: number;
}

export interface SourceBatch {
  ok: true;
  sourceId: string;
  items: NormalizedItem[];
  droppedCount: number;
  retrievedAt: string;
}

export interface SourceFailure {
  ok: false;
  sourceId: string;
  stage: FailureStage;
  code: string;
  message: string;
  retryable: boolean;
  retrievedAt: string;
  fallback?: string;
}

export interface DraftSelection {
  candidateCount: number;
  selectedCount: number;
  maxItems: number;
  requireTopicMatch: boolean;
  /** Legacy compatibility field; current selection is global and does not emit source caps. */
  maxItemsPerSource?: number;
  /** Additive v1 extension: counts at each deterministic filtering stage. */
  filterStats?: FilterStats;
  sections?: DraftSectionSelection[];
}

export interface FilterStats {
  maxAgeHours: number;
  requirePublishedAt?: boolean;
  collectedCount: number;
  qualityPassedCount: number;
  freshnessPassedCount: number;
  topicMatchedCount: number;
  topicPassedCount: number;
  exclusionPassedCount: number;
  effectiveCandidateCount: number;
  unknownPublishedAtCount: number;
  unknownPublishedAtDroppedCount?: number;
  staleDroppedCount: number;
}

export interface DraftSectionSelection {
  sectionId: string;
  label: string;
  sourceIds: string[];
  maxItems: number;
  selectedCount: number;
  keywords?: string[];
  excludeKeywords?: string[];
}

export interface DraftInput {
  schemaVersion: "v1";
  runId: string;
  profileId: string;
  profileVersion: string;
  status: OverallRunStatus;
  generatedAt: string;
  templateId: string;
  topics: string[];
  selection: DraftSelection;
  items: NormalizedItem[];
  failures: SourceFailure[];
}

export interface WriterOutput {
  schemaVersion: "v1";
  title: string;
  markdown: string;
  writerId: string;
  writerVersion: string;
  writerFallback: boolean;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

export interface FetchContext {
  signal: AbortSignal;
  request(url: string, headers?: Record<string, string>): Promise<HttpResponse>;
  now(): string;
  parseHtml?(html: string): Document;
}

export interface SourceAdapter {
  readonly kind: SourceKind;
  readonly adapterVersion: string;
  readonly parserVersion: string;
  fetch(source: SourceConfig, context: FetchContext): Promise<SourceBatch | SourceFailure>;
}
