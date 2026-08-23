# Manga Sanitizer Design

> Superseded by `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`. Retained as a historical record; do not use its commands or environment variables.

## Goal

Provide a local Bun utility that converts one manga chapter, or every chapter inside a manga series, into sequential WebP pages.

## Contract

- Command: `bun run manga:sanitize <chapter-directory>`.
- Batch mode: `bun run manga:sanitize <series-directory> --all`.
- Inputs: direct `.jpg`, `.jpeg`, `.png`, and `.webp` files in directories named `chapter-###`.
- Output: `001.webp`, `002.webp`, and so on, preserving the input’s natural filename order.
- `--dry-run` prints the mapping without changing files.
- Quality defaults to 85 and can be overridden with `--quality <1-100>`.
- Uses the locally installed `cwebp`; no package dependency is added.

## Safety

- Conversion writes to a hidden sibling staging directory.
- The original chapter is replaced only when every output file has been created successfully.
- Failed conversions leave the original chapter intact.
- The tool never processes `cover.jpg` or the `art/` directory.

## Non-goals

- It does not alter chapter content frontmatter.
- It does not resize images or change artwork metadata.
