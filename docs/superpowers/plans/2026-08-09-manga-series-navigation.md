# Manga Series Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manga chapters immediately reachable on series pages and provide a new-tab full-size link for every artwork image.

**Architecture:** Keep the existing Astro component boundaries. Reorder the series page composition so `MangaChapterList` precedes `MangaArtGallery`, and make each gallery image a direct link to its source with safe new-tab attributes.

**Tech Stack:** Astro 7, TypeScript, Bun test.

## Global Constraints

- Preserve existing artwork captions and lazy-loading behavior.
- Open full-size artwork in a new tab with `target="_blank"` and `rel="noopener noreferrer"`.
- Do not change Git state.

---

### Task 1: Reorder manga sections and add artwork full-size links

**Files:**
- Modify: `src/pages/manga/[slug].astro`
- Modify: `src/components/MangaArtGallery.astro`
- Test: `tests/manga-series-navigation.test.ts`

- [ ] Write a source-level regression test for section order and link attributes.
- [ ] Run the focused test and confirm it fails because the current page order and gallery links do not meet the requirement.
- [ ] Move the chapter list before the artwork gallery and wrap each gallery image in a full-size link.
- [ ] Run the focused test and the production build.
