# Broad Profile v2 smoke evidence

Date: 2026-09-05

Command: `npm run smoke:broad`

Profile: `broad-trending-v2` / `v2`

```text
cn-solidot: ok items=10 dropped=0
cn-infoq: ok items=10 dropped=0
cn-meituan-tech: ok items=10 dropped=0
cn-ruanyifeng-weekly: ok items=3 dropped=0
global-lobsters: ok items=10 dropped=0
global-openai-blog: ok items=10 dropped=0
global-google-ai: NETWORK_ERROR stage=fetch retryable=true
global-techcrunch: ok items=10 dropped=0
global-ars: ok items=10 dropped=0
global-wired: ok items=10 dropped=0
research-arxiv-cs-ai: ok items=10 dropped=0
research-arxiv-cs-lg: ok items=10 dropped=0
global-github-ai: ok items=10 dropped=0
global-hn-top: ok items=10 dropped=0
selection: candidates=120 selected=23 perSource=none
quality: selectedLowQuality=0 selectedFuturePublishedAt=0 selectedTopicless=0
summary: healthy=13/14 required=11 sections=6 missingHeadings=0
```

The sixth rendered block is the explicit `other` block produced for selected items whose source is
not assigned to a presentation section. Sections remain a display grouping only; selection is still
global and no section quota is used. The single Google AI fetch failure is retained as a source-level
failure and does not make the run look fully healthy.
