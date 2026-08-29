# Trending Radar Writer File Contract v1

## Input

`draft-input.json` is the C-0003 v1 `DraftInput` saved by the plugin. Required top-level fields are:

`schemaVersion`, `runId`, `profileId`, `profileVersion`, `status`, `generatedAt`, `templateId`, `topics`, `selection`, `items`, `failures`.

`items[]` contains normalized source items and their `verification` objects. `failures[]` contains at least `sourceId`, `stage`, `code`, `message`, `retryable`, and `retrievedAt`.

## Output

Write `writer-output.json` in the same run directory:

```json
{
  "schemaVersion": "v1",
  "title": "Trending Radar 2026-08-28",
  "markdown": "# Trending Radar 2026-08-28\n...",
  "writerId": "trending-radar-writer",
  "writerVersion": "v1",
  "writerFallback": false
}
```

`markdown` is one complete, directly readable article. It must retain run status, run ID, profile, candidate/selected counts, topics, all failures, and the source/title/link/date/excerpt/verification facts needed to audit selected items. The external writer may improve prose but cannot modify the input JSON or change those facts.

The plugin's visible destination remains `outputDirectory/Trending Radar YYYY-MM-DD.md`. This file is only an intermediate machine artifact until a host applies the validated external output.
