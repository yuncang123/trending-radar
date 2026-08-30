# Chinese Source Pack v1 smoke evidence

Date: 2026-08-30

## Direct source health

Command: `npm run smoke:cn`

```text
cn-sspai: ok items=10 latest=2026-08-29T01:20:06.000Z fresh=true
cn-solidot: ok items=10 latest=2026-08-29T23:44:03.000Z fresh=true
cn-infoq: ok items=10 latest=2026-08-29T13:19:17.000Z fresh=true
cn-qbitai: ok items=10 latest=2026-08-29T13:11:08.000Z fresh=true
cn-oschina: ok items=10 latest=2026-08-29T10:14:00.000Z fresh=true
cn-cnblogs: ok items=10 latest=2026-08-30T06:25:00.000Z fresh=true
summary: healthy=6/6 required=5 maxAgeDays=14
```

This is time-specific network evidence. The smoke fails when fewer than five sources return at
least one item published within the last 14 days; every source still prints its own structured
failure instead of disappearing from the result.

## Obsidian end-to-end smoke

- Isolated Vault: `<isolated-vault>`.
- Profile: `chinese-tech-v1` / `v1`.
- Command: `trending-radar:run-manual` through the Obsidian CLI.
- Run: `2026-08-30T06-42-52-974Z-l7qw9f`.
- Result: `completed`; all six sources `succeeded`; 60 candidates and 50 selected items.
- Output: `Trending Radar 2026-08-30.md`, 29,354 bytes.
- Obsidian `dev:errors`: `No errors captured.`

The selected set contained items from all six sources. Source counts were uneven because the
existing deterministic topic/date ordering has no per-source diversity quota; that is a separate
quality decision, not hidden by this source-health result.

## Prior-art verdict

Reuse the existing `RssAdapter` and `rss-parser` for direct public feeds. Public RSSHub remains an
optional user-configured extension, not a core dependency. Zhihu, 36Kr, Bilibili, and V2EX are not
default sources in v1 because current public probes require authentication, return anti-bot/error
payloads, or are unavailable. Dedicated adapters require a later stability decision and must keep
failures visible.
