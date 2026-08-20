# Manga Series Art Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give manga series pages a primary cover and an optional static artwork gallery.

**Architecture:** A series keeps one `cover` asset plus an ordered `art` array in its Markdown frontmatter. A focused gallery component renders the optional array on the series page; chapters and the reader stay untouched.

**Tech Stack:** Astro 7, Content Collections, local files in `public/`.

---

### Task 1: Model optional series artwork

**Files:**
- Modify: `src/content.config.ts`
- Modify: `src/content/manga/series/witches-and-cigarettes.md`
- Test: `tests/manga-routes.test.ts`

- [ ] Add `art: z.array(mediaSchema).default([])` to `mangaSeriesSchema`.
- [ ] Make the fixture cover `/manga/witches-and-cigarettes/cover.jpg` and add the second artwork with descriptive alt text.
- [ ] Add a schema assertion covering the `art` field.

### Task 2: Render the series artwork

**Files:**
- Create: `src/components/MangaArtGallery.astro`
- Modify: `src/pages/manga/[slug].astro`

- [ ] Render the series cover in the header beside the title and metadata.
- [ ] Render `MangaArtGallery` only when `series.data.art.length` is non-zero, before the chapter list.
- [ ] Keep images local, responsive, lazy-loaded, and inside the explicit-content warning boundary.

### Task 3: Verify

**Files:**
- Test: `tests/manga-routes.test.ts`

- [ ] Run `bun test`.
- [ ] Run `bunx astro check`.
- [ ] Run `bun run build` and confirm the manga series route is generated.
