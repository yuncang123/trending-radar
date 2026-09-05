# Trending Radar

This is the first implementation slice of the open-source SecondBrain toolkit.

The current plugin is Desktop-only and manual. It validates a JSON-equivalent Profile, fetches RSS/Atom, public URLs, GitHub, Hacker News, and RSSHub-compatible Chinese sources, then normalizes, deterministically deduplicates, selects, and writes a Markdown draft. Source-level results, failures, and the versioned `draft-input.json` are persisted under the configured vault directory with explicit `completed`, `partial`, `failed`, `cancelled`, and `interrupted` outcomes.

The settings page edits that Profile directly. It is divided into Output & Profile, API & Model, Target Sources, Focus Topics, Filtering, and Run. Sources can be grouped, enabled, added, edited, or removed across all supported adapter kinds; topic keywords and deterministic report filters are editable without hand-writing JSON. Every successful Profile edit validates first and increments the Profile version so a later run cannot silently reuse results from older settings. RSS and RSSHub-compatible sources honor their per-source `limit`; public URL sources always produce at most one item.

The settings page and plugin notices support `简体中文` and `English`. The default `Auto` choice follows the browser language (`zh-*` uses Simplified Chinese and other languages use English). Language is stored only in the plugin's local settings; Profiles, run ledgers, logs, source facts, and Provider payloads remain language-neutral.

Each completed run writes `Trending Radar YYYY-MM-DD.md` in the configured output directory. The default template Writer is deterministic and dependency-free: it canonicalizes parseable publication dates (and infers an explicit `YYYY/MM/DD` date from an article URL when a feed omits one), applies a rolling daily freshness window (`filter.maxAgeHours`, default 24 hours), excludes undated items from the candidate pool by default, applies quality gates and topic matching, then ranks by topic relevance, source-native popularity signals, and publication time before taking the global top `filter.maxItems`. Undated and stale items remain in source evidence and are counted rather than silently lost. GitHub and Hacker News signals are preserved on each item as optional `signals` fields. Sections organize selected trends for reading; their order and item caps do not displace higher-ranked items. Source failures remain at the top of the draft. `filter.reuseMaxAgeMinutes=0` forces fresh source fetches; omitting it preserves reusable-source behavior for legacy Profiles. An external Agent Skill can take over later by consuming the run's `draft-input.json`; it cannot alter source verification facts.

When an external Skill has written `writer-output.json` beside the latest run's `draft-input.json`, advanced integrations can use the `Apply external Trending Radar draft` command from Obsidian's command palette. The plugin validates the run and fact anchors before safely replacing the same daily file; invalid or missing output leaves the template draft untouched. This compatibility command is intentionally omitted from the regular settings flow.

The settings page also supports optional Anthropic-compatible AI ranking. Configure the local `API Key`, gateway `API Base URL`, and `Model ID`, then use `AI-rank daily report` (or the command palette). The model scores every candidate from 0–100 across trend importance, topic relevance, timeliness, and evidence quality, and assigns a shared event key to duplicate coverage. Deterministic code validates that every candidate has exactly one bounded score, keeps at most `filter.aiMaxItems` unique events at or above `filter.aiMinimumScore`, and writes those items to the same daily file. The full ranking is saved as `ai-ranking.json`; source facts remain unchanged. HTTP, timeout, invalid-response, and fact-validation failures leave the deterministic template draft in place and are reported in the Notice and developer console. The API key is never written to Profiles, run artifacts, Markdown, or logs.

Next to `Model ID`, use `Refresh` to load model IDs from the configured Provider's `GET /v1/models` endpoint. The field remains editable and supports autocomplete. `Verify` sends a tiny fixed Messages request for the current model and reports whether that model returned usable text; this is a reachability check, not a quality or pricing guarantee. The model list is kept in memory only and is cleared when the key or base URL changes.

Start from `profiles/example.json`, or create a Profile from the settings page. A newly created Profile is seeded with the 27-source broad catalog: 14 direct RSS/API sources selected for high reading value are enabled by default and 13 noisier/discovery feeds are available but opt-in. An existing empty Profile can use `Add recommended sources` to restore it without replacing custom sources. Provider secrets do not belong in a shared Profile. Scheduling and publishing are outside this plugin.

For a usable Chinese technology baseline, start from `profiles/chinese-tech-v2.json`. It enables ten
direct public RSS feeds (少数派、Solidot、InfoQ 中文、量子位、开源中国、博客园、IT之家、美团技术团队、阮一峰科技爱好者周刊、爱范儿)
and does not rely on a public RSSHub instance. The earlier six-source set remains available as
`profiles/chinese-tech-v1.json` for rollback and comparison. Run `npm run smoke:cn` to see per-source
item counts, newest publication time, freshness, and structured failures; the v2 smoke passes when at
least eight sources have an item published within the last 14 days.

For optional third-party discovery, use `profiles/chinese-third-party-v1.json` and read
`THIRD-PARTY-SOURCES.md` first. It contains one enabled Google News RSS discovery feed and one
disabled self-hosted RSSHub template. This profile is intentionally separate from the default
direct-feed baseline and is not included in the Chinese source smoke.

For the intended broad daily report, use `profiles/broad-trending-v2.json`. It combines Chinese core,
global, research, GitHub, Hacker News, and discovery sources into one run and one candidate pool.
Deterministic scoring retains a broad pool of up to 50 current candidates; optional AI ranking then
keeps at most 15 unique events scoring 70 or higher. The report renders five Sections: 中文核心与发现、
代码与开发者、AI 研究与官方、全球深度科技与产业、社区与产品发现. The smaller Chinese,
third-party, global, and research profiles remain useful as independently smokeable source packs.

The exact 25-source Trending Digest baseline and the reasons some of its sources are not yet stable
Trending Radar adapters are recorded in
[`docs/research/trending-digest-source-baseline-2026-09-05.md`](docs/research/trending-digest-source-baseline-2026-09-05.md).

Development follows the official Obsidian sample plugin shape:

```text
npm ci
npm run build
npm test -- --run
npm run smoke
npm run smoke:cn
npm run smoke:third-party
npm run smoke:global
npm run smoke:research
npm run smoke:broad
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
