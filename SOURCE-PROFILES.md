# Source profiles

Trending Radar keeps source families separate so broad coverage does not turn one daily report
into an unbounded feed.

| Profile | Role | Smoke |
|---|---|---|
| `profiles/chinese-tech-v2.json` | Stable Chinese technology baseline | `npm run smoke:cn` |
| `profiles/chinese-third-party-v1.json` | Optional Chinese discovery and self-hosted extension | `npm run smoke:third-party` |
| `profiles/global-tech-v1.json` | Global technology, industry, and developer coverage | `npm run smoke:global` |
| `profiles/research-signals-v1.json` | AI/ML research signals from arXiv | `npm run smoke:research` |

The 2026-08-31 smoke checks recorded `6/6` healthy global sources and `2/2` healthy research
sources. See [SMOKE-GLOBAL-SOURCES.md](SMOKE-GLOBAL-SOURCES.md) and
[SMOKE-RESEARCH-SOURCES.md](SMOKE-RESEARCH-SOURCES.md) for the time-specific output.

Do not merge every profile into one default list without reviewing per-source quotas, duplicate
rates, topic hit rates, and final selection distribution. The current Writer's `maxItems` is a
global cap, so high-volume feeds can otherwise crowd out slower, higher-value sources.
