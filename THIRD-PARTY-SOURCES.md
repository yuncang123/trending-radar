# Third-party source profile

`profiles/chinese-third-party-v1.json` is an opt-in extension profile. It is separate from the
stable direct-feed packs and is not used by `npm run smoke:cn`. Run `npm run smoke:third-party` to
verify the enabled discovery feed and see disabled templates explicitly skipped.

## Included sources

- `cn-google-news-ai` is an enabled Google News RSS discovery feed for Chinese AI, large-model,
  and agent terms. It is an aggregator, not an authority source; duplicate and redirect-heavy
  results are expected.
- `cn-rsshub-self-hosted` is a disabled `rsshub-compatible` template. Replace its URL with a
  user-controlled self-hosted RSSHub or compatible provider route before enabling it. The plugin
  does not bundle RSSHub, use a public RSSHub instance, or store provider credentials in a Profile.

## Operating boundary

Use the direct `chinese-tech-v2` pack as the default factual baseline. Enable this profile only
when discovery breadth is more valuable than source authority. Keep failures visible and review
the provider route periodically; a successful HTTP response does not prove that the upstream
website remains complete or accurate.

The Google News endpoint was probed on 2026-08-31 and returned HTTP 200 with `application/xml`;
`npm run smoke:third-party` is the repeatable check. This is time-specific network evidence, not a
guarantee of future availability or ranking quality.

Latest smoke (`2026-08-31`):

```text
cn-rsshub-self-hosted: skipped enabled=false kind=rsshub-compatible
cn-google-news-ai: ok items=20 dropped=0 latest=2026-08-31T04:14:58.000Z fresh=true
summary: healthy=1/1 required=1 skipped=1 maxAgeDays=14
```
