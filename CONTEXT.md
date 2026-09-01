# Trending Radar

Trending Radar collects broad public signals into one auditable candidate pool and shapes one
interest-focused daily report.

## Language

**Profile**:
The complete source, interest, selection, and output configuration for one Trending Radar run.
_Avoid_: Source pack, section

**Source Pack**:
A reusable or diagnostic source-family configuration that can be copied into a Profile and smoked
independently. It does not imply a separate user-facing report.
_Avoid_: Profile, feed

**Section**:
A deterministic presentation partition of globally selected items inside one report, with source
membership and optional item keywords/exclusions. Section order and item caps never decide which
trends enter the global selection. All Sections share the same run, candidate pool, topics, failures,
and output file.
_Avoid_: Profile, independent report

**Discovery Source**:
An aggregator used to widen the candidate pool when direct sources may miss a trend. Its items keep
their aggregator provenance and do not become authority claims.
_Avoid_: Fact source
