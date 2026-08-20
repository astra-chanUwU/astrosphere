# Oneshot Doujinshi Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the two supplied completed doujinshi as readable manga series with covers, artwork, creator credits, metadata, and one chapter each.

**Architecture:** Follow the existing Astro manga collections: each title gets a series Markdown entry and a chapter Markdown entry. Reader assets live under `public/manga/<slug>/chapter-001/`, with normalized sequential JPEG names required by `createMangaPageSrc`; cover and gallery art live beside them.

**Tech Stack:** Astro content collections, Markdown frontmatter, public JPEG assets, Bun/Astro build validation.

## Global Constraints

- Use `explicit` for the first title and `suggestive` for the second title’s mature-but-not-explicit metadata as supplied.
- Use internal creator slugs `umour` and `creampan`.
- Keep both series `visibility: published`, `status: completed`, and `origin: original`.
- Do not modify Git state; repository instructions require direct work on the main branch without Git commands.
- Normalize chapter assets to exactly the filenames and extension expected by each chapter frontmatter.

### Task 1: Add series metadata

**Files:**
- Create: `src/content/manga/series/boku-no-sensei-wa-ero-haishinsha.md`
- Create: `src/content/manga/series/daisuki-yuri.md`

- [x] Add the two series frontmatter entries with supplied titles, aliases, creators, years, formats, ratings, and conservative tags.

### Task 2: Add chapter metadata

**Files:**
- Create: `src/content/manga/chapters/boku-no-sensei-wa-ero-haishinsha-chapter-001.md`
- Create: `src/content/manga/chapters/daisuki-yuri-chapter-001.md`

- [x] Add one published RTL chapter per series with normalized page paths, counts, and source image dimensions.

### Task 3: Publish supplied assets

**Files:**
- Create: `public/manga/boku-no-sensei-wa-ero-haishinsha/cover.jpg`
- Create: `public/manga/boku-no-sensei-wa-ero-haishinsha/art/1.jpg`
- Create: `public/manga/boku-no-sensei-wa-ero-haishinsha/chapter-001/001.jpg` through `031.jpg`
- Create: `public/manga/daisuki-yuri/cover.jpg`
- Create: `public/manga/daisuki-yuri/art/1.jpg` through `3.jpg`
- Create: `public/manga/daisuki-yuri/chapter-001/001.jpg` through `032.jpg`

- [x] Copy the supplied images, converting PNGs to JPEG where needed and renaming the unpadded first-title page `13.jpeg` to `013.jpg`.

### Task 4: Validate publication

**Files:**
- Verify all newly created content and public assets.

- [x] Run `bun run build`.
- [x] Confirm the build’s publishing guard reports no missing chapter assets or invalid manga references.
- [x] Confirm the generated routes include both series pages and both chapter pages.
