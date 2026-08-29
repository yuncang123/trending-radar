---
name: trending-radar-writer
description: "Consume a Trending Radar C-0003 draft-input.json and produce a fact-preserving writer-output.json when an external writing pass is requested."
---

# Trending Radar Writer

Turn a saved Trending Radar run into a readable external draft while keeping the plugin's single-article experience. Use this skill when a run directory contains `draft-input.json` and the user asks for an external writer, a different writing style, or a polished Trending Radar article.

## Workflow

1. Locate the input. Use the explicitly supplied `draft-input.json` path when present. Otherwise locate the newest `draft-input.json` under the configured vault output directory's `.trending-radar/runs/` tree. Do not search unrelated folders.
2. Read the complete JSON and validate the C-0003 v1 shape. For field meanings and output invariants, read [file-contract-v1.md](references/file-contract-v1.md).
3. Treat `items[]`, every `items[].verification`, `failures[]`, and `selection` as read-only facts. A style skill may change wording, grouping, and emphasis, but it may not add sources, alter dates, invent verification, remove failures, or claim facts absent from the input.
4. Write one complete Markdown article. Keep a compact factual status block at the top with run ID, profile, candidate/selected counts, topics, and every failure. When no items are selected, say so explicitly and retain the failure or empty-result explanation.
5. Write a JSON object conforming to C-0003 `WriterOutput` as `writer-output.json` beside the input. Set `writerId` to `trending-radar-writer`, `writerVersion` to `v1`, and `writerFallback` to `false`. End the file with a newline. Do not create a second default article in the vault output directory.
6. Report the output path and any limitations. If validation fails, do not write a partial output; report the exact field or invariant that failed so the template draft remains the usable result.

## Style delegation

When the user names another writing skill or supplies a style profile, apply it only after the factual status and evidence boundary are established. `writing-shape` is compatible as a design reference for grounding and paragraph shape; it does not replace this skill's JSON validation or fact-preservation rules.

## Completion

The run is complete when `writer-output.json` parses, has the required C-0003 fields, contains non-empty Markdown with the status and failure sections, and is stored beside the exact input file that was read.
