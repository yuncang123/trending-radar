# Source profiles

Trending Radar collects broad sources into one Profile and one report. Smaller source packs remain
available for independent health checks and focused runs; they are not separate product reports.

| Profile | Role | Smoke |
|---|---|---|
| `profiles/broad-trending-v1.json` | Combined daily run with four deterministic report Sections | `npm run smoke:broad` |
| `profiles/chinese-tech-v2.json` | Stable Chinese technology baseline | `npm run smoke:cn` |
| `profiles/chinese-third-party-v1.json` | Optional Chinese discovery and self-hosted extension | `npm run smoke:third-party` |
| `profiles/global-tech-v1.json` | Global technology, industry, and developer coverage | `npm run smoke:global` |
| `profiles/research-signals-v1.json` | AI/ML research signals from arXiv | `npm run smoke:research` |

The 2026-09-01 checks recorded `21/21` successful broad sources and `10/10` parseable direct Chinese
feeds (`9/10` with explicit dates inside the 14-day freshness window). The earlier 2026-08-31 checks
recorded `6/6` healthy global sources and `2/2` healthy research sources. See
[SMOKE-GLOBAL-SOURCES.md](SMOKE-GLOBAL-SOURCES.md) and
[SMOKE-RESEARCH-SOURCES.md](SMOKE-RESEARCH-SOURCES.md) for the time-specific output.

The broad Profile combines 21 sources into one candidate pool, forces a fresh fetch for every
manual run (`reuseMaxAgeMinutes=0`), rejects placeholder excerpts and future publication times,
and requires a title/excerpt topic match. It ranks that complete pool globally by topic relevance
and publication time, then classifies the selected trends into four presentation Sections:
开源与开发、AI 前沿、产品与产业、媒体与发现. Section caps, exploration, and backfill are retained
as legacy Profile fields for parsing but do not alter global selection; source failures remain
visible at the top of the same report.

See [SMOKE-BROAD-PROFILE.md](SMOKE-BROAD-PROFILE.md) for the combined source, selection, and
Obsidian end-to-end evidence.

The broad GitHub source explicitly requests `sort=stars` as a popularity baseline. This is still
not a growth-rate metric; repository velocity and research impact remain separate future source
contracts rather than being inferred from RSS fields.
