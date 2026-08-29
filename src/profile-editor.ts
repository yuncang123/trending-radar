import { parseProfile } from "./profile.js";
import type { Profile } from "./types.js";

export const DEFAULT_PROFILE_PATH = "trending-radar-profile.json";

export function createDefaultProfile(outputDirectory: string): Profile {
  return parseProfile({
    profileId: "default",
    version: "v1",
    outputDirectory,
    sources: [],
    topics: [],
    filter: { maxItems: 50, requireTopicMatch: false },
    templateId: "default"
  });
}

export function nextProfileVersion(version: string, now = new Date()): string {
  const numbered = /^v(\d+)$/.exec(version);
  if (numbered) return `v${Number(numbered[1]) + 1}`;
  const revision = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${version.replace(/-\d{8}T\d{6}Z$/, "")}-${revision}`;
}

/** Clone, mutate, version, then validate so invalid UI edits never reach disk. */
export function reviseProfile(profile: Profile, mutate: (draft: Profile) => void, now = new Date()): Profile {
  const draft = JSON.parse(JSON.stringify(profile)) as Profile;
  mutate(draft);
  draft.version = nextProfileVersion(profile.version, now);
  return parseProfile(draft);
}
