# Broad Trending Profile smoke evidence

Date: 2026-08-31

## Combined source and selection smoke

Command: `npm run smoke:broad`

```text
19 of 20 sources succeeded; cn-google-news-ai reported NETWORK_ERROR.
selection: candidates=185 selected=45 perSource=4
section: open-source-and-developers selected=16/16
section: ai-frontier selected=14/14
section: products-and-industry selected=15/15
section: media-and-discovery selected=0/5
summary: healthy=19/20 required=17 sections=4/4 missingHeadings=0
```

All successful source items entered one deduplicated candidate pool before topic scoring and
Section selection. The failed discovery source remained visible and its empty Section was rendered
instead of being silently filled with unrelated items.

## Obsidian end-to-end smoke

- Isolated Vault: `<isolated-vault>`.
- Profile: `broad-trending-v1` / `v1`.
- Command: `trending-radar:run-manual` through the Obsidian CLI.
- Run: `2026-08-31T11-25-19-469Z-enzne6`.
- Result: `partial`; 18 sources succeeded; Lobsters and Google News timed out with structured,
  retryable failures.
- Selection: 175 candidates, 45 selected, maximum four items per source.
- Sections: 开源与开发 `16/16`, AI 前沿 `14/14`, 产品与产业 `15/15`, 媒体与发现 `0/5`.
- Output: one `Trending Radar 2026-08-31.md` containing the failure block and all four headings.
- Obsidian `dev:errors`: `No errors captured.`

This is time-specific network evidence. A source appearing in the candidate pool does not guarantee
selection: topic score, publication time, Section cap, and per-source cap determine the final set.
