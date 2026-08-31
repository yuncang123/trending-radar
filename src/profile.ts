import { SOURCE_KINDS, type Profile, type SourceConfig } from "./types.js";

const PRIVATE_KEYS = /(?:api.?key|token|secret|password|authorization|private.?endpoint|credential)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNoPrivateProviderConfig(value: unknown, path = "profile"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateProviderConfig(item, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const providerField = /(?:^|\.)(?:provider|providers|writer|writers)(?:\.|$)/i.test(path);
    if (PRIVATE_KEYS.test(key) || (providerField && /endpoint/i.test(key))) {
      throw new Error(`shared Profile cannot contain private provider field: ${path}.${key}`);
    }
    assertNoPrivateProviderConfig(child, `${path}.${key}`);
  }
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string`);
  return value.trim();
}

function safeId(value: unknown, field: string): string {
  const id = requiredString(value, field);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)) throw new Error(`${field} must be a safe stable identifier`);
  return id;
}

function vaultRelativePath(value: unknown, field: string): string {
  const path = requiredString(value, field).replace(/\\/g, "/");
  if (path.startsWith("/") || /^[a-z]:/i.test(path) || path.split("/").includes("..")) throw new Error(`${field} must stay inside the vault`);
  return path.replace(/^\.\//, "");
}

function validateSelectionFilter(filter: Record<string, unknown>): void {
  if (filter.maxItemsPerSource !== undefined && (!Number.isInteger(filter.maxItemsPerSource) || Number(filter.maxItemsPerSource) <= 0)) {
    throw new Error("filter.maxItemsPerSource must be a positive integer");
  }
  if (filter.sections === undefined) return;
  if (!Array.isArray(filter.sections)) throw new Error("filter.sections must be an array");

  const sectionIds = new Set<string>();
  const assignedSources = new Set<string>();
  filter.sections.forEach((raw, index) => {
    if (!isRecord(raw)) throw new Error(`filter.sections[${index}] must be an object`);
    const sectionId = safeId(raw.sectionId, `filter.sections[${index}].sectionId`);
    if (sectionIds.has(sectionId)) throw new Error(`duplicate sectionId: ${sectionId}`);
    sectionIds.add(sectionId);
    requiredString(raw.label, `filter.sections[${index}].label`);
    if (!Number.isInteger(raw.maxItems) || Number(raw.maxItems) <= 0) {
      throw new Error(`filter.sections[${index}].maxItems must be a positive integer`);
    }
    if (!Array.isArray(raw.sourceIds) || raw.sourceIds.length === 0) {
      throw new Error(`filter.sections[${index}].sourceIds must be a non-empty array`);
    }
    raw.sourceIds.forEach((value, sourceIndex) => {
      const sourceId = safeId(value, `filter.sections[${index}].sourceIds[${sourceIndex}]`);
      if (assignedSources.has(sourceId)) throw new Error(`sourceId assigned to multiple sections: ${sourceId}`);
      assignedSources.add(sourceId);
    });
  });
}

export function validateVaultRelativePath(value: unknown, field = "path"): string {
  return vaultRelativePath(value, field);
}

export function parseProfile(input: unknown): Profile {
  if (!isRecord(input)) throw new Error("Profile must be an object");
  assertNoPrivateProviderConfig(input);

  const sourcesValue = input.sources;
  if (!Array.isArray(sourcesValue)) throw new Error("sources must be an array");
  const seen = new Set<string>();
  const sources: SourceConfig[] = sourcesValue.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`sources[${index}] must be an object`);
    const sourceId = safeId(raw.sourceId, `sources[${index}].sourceId`);
    if (seen.has(sourceId)) throw new Error(`duplicate sourceId: ${sourceId}`);
    seen.add(sourceId);
    if (typeof raw.kind !== "string" || !SOURCE_KINDS.includes(raw.kind as (typeof SOURCE_KINDS)[number])) {
      throw new Error(`unknown source kind at sources[${index}].kind`);
    }
    if (typeof raw.enabled !== "boolean") throw new Error(`sources[${index}].enabled must be boolean`);
    return { ...raw, sourceId, kind: raw.kind as SourceConfig["kind"], enabled: raw.enabled };
  });

  if (!Array.isArray(input.topics) || input.topics.some((topic) => typeof topic !== "string")) {
    throw new Error("topics must be an array of strings");
  }
  if (!isRecord(input.filter)) throw new Error("filter must be an object");
  validateSelectionFilter(input.filter);

  return {
    ...input,
    profileId: safeId(input.profileId, "profileId"),
    version: requiredString(input.version, "version"),
    outputDirectory: vaultRelativePath(input.outputDirectory, "outputDirectory"),
    sources,
    topics: input.topics as string[],
    filter: input.filter,
    templateId: requiredString(input.templateId, "templateId"),
    writerId: input.writerId === undefined ? undefined : requiredString(input.writerId, "writerId")
  };
}
