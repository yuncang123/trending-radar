# Source profiles

Trending Radar collects broad sources into one Profile and one report. Smaller source packs remain
available for independent health checks and focused runs; they are not separate product reports.

| Profile | Role | Smoke |
|---|---|---|
| `profiles/broad-trending-v2.json` | Combined daily run with a curated default and opt-in discovery sources | `npm run smoke:broad` |
| `profiles/chinese-tech-v2.json` | Stable Chinese technology baseline | `npm run smoke:cn` |
| `profiles/chinese-third-party-v1.json` | Optional Chinese discovery and self-hosted extension | `npm run smoke:third-party` |
| `profiles/global-tech-v1.json` | Global technology, industry, and developer coverage | `npm run smoke:global` |
| `profiles/research-signals-v1.json` | AI/ML research signals from arXiv | `npm run smoke:research` |

The 2026-09-01 checks recorded `21/21` successful broad sources and `10/10` parseable direct Chinese
feeds (`9/10` with explicit dates inside the 14-day freshness window). The earlier 2026-08-31 checks
recorded `6/6` healthy global sources and `2/2` healthy research sources. See
[SMOKE-GLOBAL-SOURCES.md](SMOKE-GLOBAL-SOURCES.md) and
[SMOKE-RESEARCH-SOURCES.md](SMOKE-RESEARCH-SOURCES.md) for the time-specific output.

The current broad Profile contains 27 configured sources, with 14 direct RSS/API sources selected
for high reading value enabled by default and 13 noisier or discovery-oriented feeds opt-in. It forces a fresh fetch for every
manual run (`reuseMaxAgeMinutes=0`), rejects placeholder excerpts and future publication times,
and requires a title/excerpt topic match. It ranks the complete fetched pool globally by topic
relevance and publication time, then classifies selected trends into five presentation Sections:
中文核心与发现、代码与开发者、AI 研究与官方、全球深度科技与产业、社区与产品发现. Section caps
are presentation metadata and do not create an artificial balance or displace higher-ranked items;
source failures remain visible at the top of the same report.

The default Chinese subset intentionally starts with Solidot、InfoQ 中文、美团技术团队 and 阮一峰
科技爱好者周刊. 少数派、量子位、开源中国、博客园、IT之家、爱范儿、SegmentFault and Google News
remain available in the catalog but are opt-in because their update mix or editorial signal is less
consistent for a time-constrained daily read.

See [SMOKE-BROAD-PROFILE-V2.md](SMOKE-BROAD-PROFILE-V2.md) for the current source and selection
smoke evidence. `SMOKE-BROAD-PROFILE.md` remains the historical v1 run record.

The broad GitHub source explicitly requests `sort=stars` as a popularity baseline. This is still
not a growth-rate metric; repository velocity and research impact remain separate future source
contracts rather than being inferred from RSS fields.
