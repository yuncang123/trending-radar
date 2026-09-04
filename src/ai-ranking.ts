import type { DraftInput, NormalizedItem } from "./types.js";

export interface AiItemScore {
  index: number;
  score: number;
  eventKey: string;
  reason: string;
}

export interface AiRankingArtifact {
  schemaVersion: "v1";
  runId: string;
  model: string;
  generatedAt: string;
  minimumScore: number;
  maxItems: number;
  candidateCount: number;
  selectedCount: number;
  scores: Array<AiItemScore & {
    sourceId: string;
    title: string;
    url: string;
    selected: boolean;
  }>;
}

export interface RankedItem {
  item: NormalizedItem;
  score: AiItemScore;
}

function normalizeEventKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function parseAiScores(text: string, candidateCount: number): AiItemScore[] | undefined {
  try {
    const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(normalized) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { scores?: unknown }).scores)) return undefined;
    const scores = (parsed as { scores: unknown[] }).scores;
    if (scores.length !== candidateCount) return undefined;

    const seen = new Set<number>();
    const result: AiItemScore[] = [];
    for (const raw of scores) {
      if (!raw || typeof raw !== "object") return undefined;
      const entry = raw as Record<string, unknown>;
      if (!Number.isInteger(entry.index) || Number(entry.index) < 0 || Number(entry.index) >= candidateCount) return undefined;
      if (!Number.isInteger(entry.score) || Number(entry.score) < 0 || Number(entry.score) > 100) return undefined;
      if (typeof entry.eventKey !== "string" || !entry.eventKey.trim() || entry.eventKey.length > 160) return undefined;
      if (typeof entry.reason !== "string" || !entry.reason.trim() || entry.reason.length > 300) return undefined;
      const index = Number(entry.index);
      if (seen.has(index)) return undefined;
      seen.add(index);
      result.push({ index, score: Number(entry.score), eventKey: entry.eventKey.trim(), reason: entry.reason.trim() });
    }
    return result.sort((a, b) => a.index - b.index);
  } catch {
    return undefined;
  }
}

export function selectAiRankedItems(
  items: readonly NormalizedItem[],
  scores: readonly AiItemScore[],
  minimumScore: number,
  maxItems: number
): RankedItem[] {
  const ranked = scores
    .map((score) => ({ item: items[score.index], score }))
    .filter((entry): entry is RankedItem => Boolean(entry.item) && entry.score.score >= minimumScore)
    .sort((a, b) => b.score.score - a.score.score || a.score.index - b.score.index);

  const events = new Set<string>();
  const selected: RankedItem[] = [];
  for (const entry of ranked) {
    const eventKey = normalizeEventKey(entry.score.eventKey);
    if (events.has(eventKey)) continue;
    events.add(eventKey);
    selected.push(entry);
    if (selected.length >= maxItems) break;
  }
  return selected;
}

export function createAiRankingArtifact(args: {
  input: DraftInput;
  model: string;
  generatedAt: string;
  minimumScore: number;
  maxItems: number;
  scores: readonly AiItemScore[];
  selected: readonly RankedItem[];
}): AiRankingArtifact {
  const selectedIndexes = new Set(args.selected.map((entry) => entry.score.index));
  return {
    schemaVersion: "v1",
    runId: args.input.runId,
    model: args.model,
    generatedAt: args.generatedAt,
    minimumScore: args.minimumScore,
    maxItems: args.maxItems,
    candidateCount: args.input.items.length,
    selectedCount: args.selected.length,
    scores: args.scores.map((score) => {
      const item = args.input.items[score.index];
      if (!item) throw new Error(`AI score references missing candidate ${score.index}`);
      return {
        ...score,
        sourceId: item.sourceId,
        title: item.title,
        url: item.url,
        selected: selectedIndexes.has(score.index)
      };
    })
  };
}
