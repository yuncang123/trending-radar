# Chinese Source Pack smoke evidence

Date: 2026-09-01

## Chinese Source Pack v2 direct source health

Command: `npm run smoke:cn`

```text
cn-sspai: ok items=10 fresh=true
cn-solidot: ok items=10 fresh=true
cn-infoq: ok items=10 fresh=true
cn-qbitai: ok items=10 fresh=true
cn-oschina: ok items=10 fresh=true
cn-cnblogs: ok items=10 fresh=true
cn-ithome: ok items=10 fresh=true
cn-meituan-tech: ok items=10 latest=unknown fresh=false
cn-ruanyifeng-weekly: ok items=3 fresh=true
cn-ifanr: ok items=10 fresh=true
summary: healthy=9/10 required=8 maxAgeDays=14
```

All ten direct feeds were reachable and parseable. 美团技术团队 does not expose per-item
publication dates in its feed, so it cannot satisfy the date-based freshness metric even though ten
items were collected. The broken Juejin endpoint is no longer part of v2. Public RSSHub is not used.

## Chinese Source Pack v1 rollback baseline

### Direct source health

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

### Obsidian end-to-end smoke

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

### Prior-art verdict

Reuse the existing `RssAdapter` and `rss-parser` for direct public feeds. Public RSSHub remains an
optional user-configured extension, not a core dependency. Zhihu, 36Kr, Bilibili, and V2EX are not
default sources in v1 because current public probes require authentication, return anti-bot/error
payloads, or are unavailable. Dedicated adapters require a later stability decision and must keep
failures visible.
