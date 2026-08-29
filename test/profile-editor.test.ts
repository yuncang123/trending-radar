import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultProfile, reviseProfile } from "../src/profile-editor.js";
import { validateVaultRelativePath } from "../src/profile.js";

test("revising a Profile preserves extension fields and increments vN versions", () => {
  const profile = {
    ...createDefaultProfile("Trending Radar"),
    version: "v5",
    extension: { owner: "community" }
  };
  const revised = reviseProfile(profile, (draft) => {
    draft.topics = ["software", "open source"];
    draft.filter = { ...draft.filter, maxItems: 25 };
  }, new Date("2026-08-29T05:00:00Z"));
  assert.equal(revised.version, "v6");
  assert.deepEqual(revised.topics, ["software", "open source"]);
  assert.deepEqual(revised.filter, { maxItems: 25, requireTopicMatch: false });
  assert.deepEqual((revised as unknown as Record<string, unknown>).extension, { owner: "community" });
});

test("revising a custom Profile version appends a stable UTC revision", () => {
  const profile = { ...createDefaultProfile("Trending Radar"), version: "team" };
  const revised = reviseProfile(profile, () => {}, new Date("2026-08-29T05:06:07Z"));
  assert.equal(revised.version, "team-20260829T050607Z");
  const revisedAgain = reviseProfile(revised, () => {}, new Date("2026-08-29T06:07:08Z"));
  assert.equal(revisedAgain.version, "team-20260829T060708Z");
});

test("Profile revisions are validated before they can be saved", () => {
  const profile = createDefaultProfile("Trending Radar");
  assert.throws(() => reviseProfile(profile, (draft) => {
    draft.sources.push({ sourceId: "../escape", kind: "rss", enabled: true, url: "https://example.com/feed" });
  }), /safe stable identifier/);
});

test("Profile editor paths must stay inside the vault", () => {
  assert.equal(validateVaultRelativePath("profiles/radar.json", "profilePath"), "profiles/radar.json");
  assert.throws(() => validateVaultRelativePath("../radar.json", "profilePath"), /inside the vault/);
});
