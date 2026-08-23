# Manga Sanitizer Implementation Plan

> Superseded by `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`. Retained as a historical record; do not use its commands or environment variables.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe local command that renames and converts manga chapter pages to sequential WebP files.

**Architecture:** Keep deterministic ordering in a small reusable library and keep file-system conversion, staging, and replacement in a Bun script. The script accepts a chapter directory or a series directory with `--all`.

**Tech Stack:** Bun, TypeScript, locally installed `cwebp`, Bun test.

## Global Constraints

- Process only direct image files from directories named `chapter-###`.
- Do not add runtime or package dependencies.
- Stage every conversion before replacing an original chapter directory.
- Default conversion quality is 85.

---

### Task 1: Deterministic page ordering

**Files:**

- Create: `src/lib/manga-sanitizer.ts`
- Test: `tests/manga-sanitizer.test.ts`

**Interfaces:**

- Produces: `sortMangaSourceFiles(files)` and `createSanitizedPageName(index)`.

- [ ] **Step 1: Write failing tests** for natural filename ordering, ignored non-image names, and zero-padded WebP output names.
- [ ] **Step 2: Run `bun test tests/manga-sanitizer.test.ts`** and confirm failure because the module is absent.
- [ ] **Step 3: Implement the two helpers** with a numeric `Intl.Collator` and supported-image filtering.
- [ ] **Step 4: Run `bun test tests/manga-sanitizer.test.ts`** and confirm pass.

### Task 2: Safe local sanitizer command

**Files:**

- Create: `scripts/sanitize-manga.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `sortMangaSourceFiles(files)` and `createSanitizedPageName(index)`.
- Produces: `bun run manga:sanitize <path> [--all] [--dry-run] [--quality 1-100]`.

- [ ] **Step 1: Implement CLI argument validation** for one input path, `--all`, `--dry-run`, and quality.
- [ ] **Step 2: Implement chapter discovery** that only accepts `chapter-###` directories and only descends into direct chapter children for `--all`.
- [ ] **Step 3: Convert each direct page into a hidden sibling staging directory** using `cwebp -q <quality>`.
- [ ] **Step 4: Swap the staged directory into place only after all conversions succeed**, removing the exact temporary backup after a successful swap.
- [ ] **Step 5: Add `manga:sanitize` package script** and verify a dry run prints no file changes.

### Task 3: Sanitize Murciélago

**Files:**

- Modify: `public/manga/murcielago/chapter-000/` through `chapter-004/`

- [ ] **Step 1: Run the batch command in dry-run mode** and inspect page counts and mappings.
- [ ] **Step 2: Run the batch conversion** with the default quality.
- [ ] **Step 3: Verify every Murciélago chapter contains only sequential `.webp` pages** and no hidden staging folders remain.
- [ ] **Step 4: Run `bun test`, `bunx astro check`, and `bun run build`**.
