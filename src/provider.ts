import type { DraftInput } from "./types.js";

export interface AnthropicRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ProviderModel {
  id: string;
  ownedBy: string | null;
}

/** Request budgets are deliberately separate because a full Writer prompt is much slower than probes. */
export const PROVIDER_TIMEOUTS_MS = Object.freeze({
  models: 20_000,
  verify: 30_000,
  aiDraft: 180_000
});

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json"
  };
}

function providerPrompt(input: DraftInput): string {
  return [
    "You are the optional writing step for Trending Radar.",
    "Use only the facts in the read-only DraftInput below.",
    "Return one complete, readable Markdown daily report and nothing else.",
    "Do not return JSON, code fences, citations not present in the input, or unsupported claims.",
    "Keep the run status, run/profile identity, candidate and selected counts, topics, every selected item's source/title/URL, and every failure source/stage/code visible in the report.",
    "DraftInput (read-only):",
    JSON.stringify(input, null, 2)
  ].join("\n\n");
}

export function buildAnthropicRequest(
  baseUrl: string,
  apiKey: string,
  model: string,
  input: DraftInput,
  maxTokens = 4096
): AnthropicRequest {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  return {
    url: `${normalizedBaseUrl}/v1/messages`,
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: model.trim(),
      max_tokens: maxTokens,
      messages: [{ role: "user", content: providerPrompt(input) }]
    })
  };
}

export function buildAnthropicModelsRequest(baseUrl: string, apiKey: string): AnthropicRequest {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  const url = normalizedBaseUrl.endsWith("/v1")
    ? `${normalizedBaseUrl}/models`
    : `${normalizedBaseUrl}/v1/models`;
  return { url, headers: anthropicHeaders(apiKey), body: "" };
}

export function buildAnthropicProbeRequest(baseUrl: string, apiKey: string, model: string, maxTokens = 8): AnthropicRequest {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  return {
    url: `${normalizedBaseUrl}/v1/messages`,
    headers: anthropicHeaders(apiKey),
    body: JSON.stringify({
      model: model.trim(),
      max_tokens: maxTokens,
      messages: [{ role: "user", content: "Reply with exactly OK." }]
    })
  };
}

export function extractAnthropicText(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const content = (parsed as { content?: unknown }).content;
    if (!Array.isArray(content)) return undefined;
    const text = content
      .filter((block): block is { type: "text"; text: string } =>
        Boolean(block) && typeof block === "object" && (block as { type?: unknown }).type === "text" && typeof (block as { text?: unknown }).text === "string"
      )
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

export function extractProviderModels(raw: string): ProviderModel[] {
  try {
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    if (!parsed || typeof parsed !== "object") return [];
    const data = (parsed as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    const models = new Map<string, ProviderModel>();
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const id = (entry as { id?: unknown }).id;
      if (typeof id !== "string" || !id.trim()) continue;
      const ownedBy = (entry as { owned_by?: unknown; ownedBy?: unknown }).owned_by ?? (entry as { ownedBy?: unknown }).ownedBy;
      const normalizedId = id.trim();
      if (models.has(normalizedId)) continue;
      models.set(normalizedId, { id: normalizedId, ownedBy: typeof ownedBy === "string" && ownedBy.trim() ? ownedBy.trim() : null });
    }
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return [];
  }
}
