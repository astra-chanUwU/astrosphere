# Manga Format Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display `Doujinshi` or `One-shot` in manga navigation and reader headings instead of the generic `Chapter` label when the series format calls for it.

**Architecture:** Add a pure helper in `src/lib/manga-reader.ts` that converts a series format and chapter number into the visible installment label. Both `MangaChapterList.astro` and `MangaReader.astro` consume the helper; the existing content schema, chapter numbering, slugs, and routes remain unchanged.

**Tech Stack:** Astro components, TypeScript, Bun test.

## Global Constraints

- Preserve the existing manga chapter schema and URL structure.
- Keep regular manga entries labeled `Chapter N`.
- Label `doujinshi` entries `Doujinshi` and `one-shot` entries `One-shot`.
- Do not modify Git state.

### Task 1: Add format-label behavior with tests

**Files:**
- Modify: `tests/manga-reader.test.ts`
- Modify: `src/lib/manga-reader.ts`

- [ ] Add failing tests for manga, doujinshi, and one-shot labels.
- [ ] Run `bun test tests/manga-reader.test.ts` and confirm the new assertions fail because the helper is missing.
- [ ] Implement the smallest pure helper that returns the required labels.
- [ ] Run `bun test tests/manga-reader.test.ts` and confirm all tests pass.

### Task 2: Apply labels to manga UI

**Files:**
- Modify: `src/components/MangaChapterList.astro`
- Modify: `src/components/MangaReader.astro`

- [ ] Use the helper for chapter list links and reader headings, keeping chapter numbers for regular manga and removing them for one-shot/doujinshi labels.
- [ ] Run the focused reader tests and the full Astro build/type check.
