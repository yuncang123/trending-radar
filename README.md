# Trending Radar

This is the first implementation slice of the open-source SecondBrain toolkit.

The current plugin is Desktop-only and manual. It validates a JSON-equivalent Profile, fetches RSS/Atom, public URLs, GitHub, Hacker News, and RSSHub-compatible Chinese sources, then normalizes, deterministically deduplicates, selects, and writes a Markdown draft. Source-level results, failures, and the versioned `draft-input.json` are persisted under the configured vault directory with explicit `completed`, `partial`, `failed`, `cancelled`, and `interrupted` outcomes.

The settings page edits that Profile directly. It is divided into Output & Profile, API & Model, Target Sources, Focus Topics, Filtering, and Run. Sources can be grouped, enabled, added, edited, or removed across all supported adapter kinds; topic keywords and deterministic report filters are editable without hand-writing JSON. Every successful Profile edit validates first and increments the Profile version so a later run cannot silently reuse results from older settings. RSS and RSSHub-compatible sources honor their per-source `limit`; public URL sources always produce at most one item.

The settings page and plugin notices support `简体中文` and `English`. The default `Auto` choice follows the browser language (`zh-*` uses Simplified Chinese and other languages use English). Language is stored only in the plugin's local settings; Profiles, run ledgers, logs, source facts, and Provider payloads remain language-neutral.

Each completed run writes `Trending Radar YYYY-MM-DD.md` in the configured output directory. The default template Writer is deterministic and dependency-free: it ranks topic matches, applies `filter.maxItems` and optional `filter.requireTopicMatch`, and always puts source failures at the top of the draft. An external Agent Skill can take over later by consuming the run's `draft-input.json`; it cannot alter source verification facts.

When an external Skill has written `writer-output.json` beside the latest run's `draft-input.json`, use the `Apply external Trending Radar draft` command or the settings button. The plugin validates the run and fact anchors before safely replacing the same daily file; invalid or missing output leaves the template draft untouched.

The settings page also supports an optional Anthropic-compatible Writer request. Configure the local `API Key`, gateway `API Base URL`, and `Model ID`, then use `Generate AI draft` (or the command palette). The plugin sends only the latest run's read-only `DraftInput`, accepts Markdown text from `content[]`, validates all fact anchors, and updates the same daily file. HTTP, timeout, invalid-response, and fact-validation failures leave the deterministic template draft in place and are reported in the Notice and developer console. The API key is never written to Profiles, run artifacts, Markdown, or logs.

Next to `Model ID`, use `Refresh` to load model IDs from the configured Provider's `GET /v1/models` endpoint. The field remains editable and supports autocomplete. `Verify` sends a tiny fixed Messages request for the current model and reports whether that model returned usable text; this is a reachability check, not a quality or pricing guarantee. The model list is kept in memory only and is cleared when the key or base URL changes.

Start from `profiles/example.json`, or create a Profile from the settings page and add custom public sources. Provider secrets do not belong in a shared Profile. Scheduling and publishing are outside this plugin.

For a usable Chinese technology baseline, start from `profiles/chinese-tech-v2.json`. It enables nine
direct public RSS feeds (少数派、Solidot、InfoQ 中文、量子位、开源中国、博客园、IT之家、掘金、爱范儿)
and does not rely on a public RSSHub instance. The earlier six-source set remains available as
`profiles/chinese-tech-v1.json` for rollback and comparison. Run `npm run smoke:cn` to see per-source
item counts, newest publication time, freshness, and structured failures; the v2 smoke passes when at
least eight sources have an item published within the last 14 days.

For optional third-party discovery, use `profiles/chinese-third-party-v1.json` and read
`THIRD-PARTY-SOURCES.md` first. It contains one enabled Google News RSS discovery feed and one
disabled self-hosted RSSHub template. This profile is intentionally separate from the default
direct-feed baseline and is not included in the Chinese source smoke.

Development follows the official Obsidian sample plugin shape:

```text
npm ci
npm run build
npm test -- --run
npm run smoke
npm run smoke:cn
```

## Repository boundary

This repository is the implementation and release source for the `trending-radar` Obsidian plugin
and its compatible `skills/trending-radar-writer` companion. Shared artifact contracts (C-0001 to
C-0004), fixtures, compatibility pins, and integration verification remain in
`D:/Develop/public/secondbrain-toolkit`; this repository does not maintain a second copy of those
contract documents.

The plugin ID remains `trending-radar`. Install the generated `manifest.json`, `main.js`, and
`styles.css` under an Obsidian vault's `.obsidian/plugins/trending-radar/` directory. Provider keys,
endpoints, and Vault paths are runtime-local settings and are never committed to this repository.

Migration source: `D:/Develop/public/secondbrain-toolkit/plugins/trending-radar/`, migrated on
2026-08-30 under T-0025. The toolkit source directory remains during validation for rollback.
