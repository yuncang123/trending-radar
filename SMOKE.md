# Source Adapter Smoke Evidence

Date: 2026-08-28

Command: `npm run smoke`

```text
rss: ok items=10 dropped=0
url: ok items=1 dropped=0
github: ok items=2 dropped=0
hn: ok items=2 dropped=0
cn-direct: ok items=20 dropped=0
cn-public-rsshub: NETWORK_ERROR stage=fetch retryable=true fallback=Check the configured route or use a self-hosted RSSHub-compatible provider.
```

The smoke script sends low-volume public requests and writes no fetched content to disk. Counts and external availability are time-specific evidence, not permanent guarantees.
