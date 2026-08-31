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

The 2026-08-31 smoke checks recorded `6/6` healthy global sources and `2/2` healthy research
sources. See [SMOKE-GLOBAL-SOURCES.md](SMOKE-GLOBAL-SOURCES.md) and
[SMOKE-RESEARCH-SOURCES.md](SMOKE-RESEARCH-SOURCES.md) for the time-specific output.

The broad Profile combines 20 sources into one candidate pool, then applies topic scoring,
`maxItemsPerSource=4`, and four Section caps: 开源与开发、AI 前沿、产品与产业、媒体与发现. The
selected items remain one auditable fact collection and produce one daily Markdown file.

See [SMOKE-BROAD-PROFILE.md](SMOKE-BROAD-PROFILE.md) for the combined source, selection, and
Obsidian end-to-end evidence.
