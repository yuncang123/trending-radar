# Chinese Source Pack v2 smoke evidence

Date: 2026-08-31

## Direct source health

Command: `npm run smoke:cn`

```text
cn-sspai: ok items=10 dropped=0 latest=2026-08-31T02:53:32.000Z fresh=true
cn-solidot: ok items=10 dropped=0 latest=2026-08-30T12:50:42.000Z fresh=true
cn-infoq: ok items=10 dropped=0 latest=2026-08-31T12:00:00.000Z fresh=true
cn-qbitai: ok items=10 dropped=0 latest=2026-08-31T03:11:46.000Z fresh=true
cn-oschina: ok items=10 dropped=0 latest=2026-08-31T02:50:40.000Z fresh=true
cn-cnblogs: ok items=10 dropped=0 latest=2026-08-31T02:35:00.000Z fresh=true
cn-ithome: ok items=10 dropped=0 latest=2026-08-31T03:53:53.000Z fresh=true
cn-juejin: ok items=10 dropped=0 latest=2026-08-31T04:04:33.000Z fresh=true
cn-ifanr: ok items=10 dropped=0 latest=2026-08-31T00:02:45.000Z fresh=true
summary: healthy=9/9 required=8 maxAgeDays=14
```

This is time-specific network evidence. The smoke fails when fewer than eight sources return at
least one item published within the last 14 days; every source still prints its own structured
failure instead of disappearing from the result.

## Obsidian end-to-end smoke

- Isolated Vault: `<isolated-vault>`.
- Profile: `chinese-tech-v2` / `v2`.
- Command: `trending-radar:run-manual` through the Obsidian CLI.
- Run: `2026-08-31T04-16-31-383Z-mrrlxb`.
- Result: `completed`; all nine sources `succeeded`; 90 candidates and 50 selected items.
- Selected source distribution: `cn-sspai=10`, `cn-solidot=4`, `cn-infoq=6`, `cn-qbitai=10`,
  `cn-oschina=10`, `cn-cnblogs=3`, `cn-ithome=3`, `cn-juejin=3`, `cn-ifanr=1`.
- Output: `Trending Radar 2026-08-31.md`, 30,109 bytes.
- Obsidian `dev:errors`: `No errors captured.`

The distribution is intentionally recorded as evidence, not treated as a source-quality quota.
Per-source diversity and ranking changes require a separate quality decision.

## Scope and exclusions

Tophub was used only as a category/source map. It is not fetched or included as a source. The v2
pack adds only direct public RSS feeds for IT之家, 掘金, and 爱范儿. Zhihu, 36Kr, Bilibili, V2EX,
虎嗅, 机器之心, Readhub, 澎湃, and 果壳 remain excluded because current public probes were
unauthenticated failures, anti-bot responses, unstable, unavailable, or lacked a confirmed RSS
endpoint.
