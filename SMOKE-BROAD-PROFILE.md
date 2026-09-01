# Broad Trending Profile smoke evidence

Date: 2026-09-01

## Current source-repair verification

Command: `npm run smoke:broad`

```text
21 of 21 sources succeeded.
selection: candidates=212 selected=50 perSource=none
quality: selectedLowQuality=0 selectedFuturePublishedAt=0 selectedTopicless=0
section: open-source-and-developers selected=14
section: ai-frontier selected=9
section: products-and-industry selected=6
section: media-and-discovery selected=4
section: other selected=17
summary: healthy=21/21 required=17 sections=5 (configured=4, other=optional) missingHeadings=0
```

The broken Juejin endpoint was removed and replaced by direct feeds from 美团技术团队 and
阮一峰科技爱好者周刊. Hacker News top stories now use one Algolia HN Search `front_page` request,
with Firebase retained as a fallback and for non-top modes.

### Current Obsidian end-to-end smoke (global ranking change)

- Isolated Vault: `D:\Obsidian\Trending-Radar-Smoke`.
- Profile: `broad-trending-v1` / `v7`.
- Run: `2026-09-01T06-06-37-526Z-mnskpq`.
- Result: `completed`; all 21 sources succeeded with zero failures.
- Selection: 212 candidates, 50 selected by global trend ranking; no per-source cap.
- Sections: 开源与开发 `15`, AI 前沿 `9`, 产品与产业 `4`, 媒体与发现 `4`, Other `18`.
- Quality: zero selected placeholder excerpts, future dates, configured noise, or duplicate URLs.
- Replacement sources: 美团技术团队 and 阮一峰科技爱好者周刊 both returned items.
- Hacker News: verification `sourceRef` is the Algolia `front_page` API.
- Obsidian `dev:errors`: `No errors captured.`

### Previous Obsidian end-to-end smoke (before global ranking change)

- Isolated Vault: `<isolated-vault>`.
- Profile: `broad-trending-v1` / `v7`.
- Run: `2026-09-01T04-09-46-797Z-66wx36`.
- Result: `completed`; all 21 sources succeeded with zero failures.
- Selection: 209 candidates, 50 selected, maximum four items per source.
- Quality: zero selected placeholder excerpts, future dates, stale retrievals, configured noise, or
  duplicate URLs.
- Replacement sources: 美团技术团队 10 items; 阮一峰科技爱好者周刊 3 items.
- Hacker News: 10 items; verification `sourceRef` is the Algolia `front_page` API.
- Obsidian `dev:errors`: `No errors captured.`

## Historical 2026-08-31 combined source and selection smoke

Command: `npm run smoke:broad`

```text
20 of 20 sources succeeded.
selection: candidates=206 selected=50 perSource=4
quality: selectedLowQuality=0 selectedFuturePublishedAt=0 selectedTopicless=0
section: open-source-and-developers selected=16/16
section: ai-frontier selected=14/14
section: products-and-industry selected=9/15
section: media-and-discovery selected=4
section: media-and-discovery selected=4/5
section: backfill selected=7/7
summary: healthy=20/20 required=17 sections=5 (configured=4, backfill=optional) missingHeadings=0
```

All successful source items entered one deduplicated candidate pool before topic scoring and
item-level Section selection. Placeholder excerpts and future-dated items were excluded from
selection. The optional backfill block keeps the report full when a configured Section has no
usable items; failures remain visible instead of being silently hidden. This historical run
predates the global-ranking-only section behavior described above.

## Historical 2026-08-31 Obsidian end-to-end smoke

- Isolated Vault: `<isolated-vault>`.
- Profile: `broad-trending-v1` / `v1`.
- Command: `trending-radar:run-manual` through the Obsidian CLI.
- Run: `2026-08-31T11-25-19-469Z-enzne6`.
- Result: `partial`; 18 sources succeeded; Lobsters and Google News timed out with structured,
  retryable failures.
- Selection: 175 candidates, 45 selected with the historical per-source cap.
- Sections: 开源与开发 `16/16`, AI 前沿 `14/14`, 产品与产业 `15/15`, 媒体与发现 `0/5`.
- Output: one `Trending Radar 2026-08-31.md` containing the failure block and all four headings.
- Obsidian `dev:errors`: `No errors captured.`

This is time-specific network evidence. A source appearing in the candidate pool does not guarantee
selection: topic score, quality gates, publication time, and global `maxItems` determine the final
set. Section keywords only classify selected items for display. The earlier E2E evidence predates
the global-ranking-only selector; the current E2E evidence above supersedes it for this behavior.
