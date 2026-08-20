# Kamiina Botan Manga Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and publish the supplied Kamiina Botan manga series, artwork, and Chapter 001.

**Architecture:** Use the existing Astro manga series/chapter collections and static reader routes. Optimize the supplied raster assets into WebP under the public archive, reference them from Markdown frontmatter, then run the existing tests/build and Sites handoff.

**Tech Stack:** Astro 7, Markdown content collections, Bun, cwebp, Pagefind, Sites hosting.

## Global Constraints

- Preserve existing manga URL and schema conventions.
- Keep the series `suggestive`, ongoing, and published only with all local assets present.
- Convert chapter pages to sequential WebP files at quality 85.
- Do not modify shared UI or unrelated manga entries.

---

### Task 1: Optimize supplied assets

**Files:**
- Create: `public/manga/kamiina-botan-yoeru-sugata-wa-yuri-no-hana/cover.webp`
- Create: `public/manga/kamiina-botan-yoeru-sugata-wa-yuri-no-hana/art/*.webp`
- Create: `public/manga/kamiina-botan-yoeru-sugata-wa-yuri-no-hana/chapter-001/*.webp`

**Interfaces:**
- Consumes the supplied banner, 8 art JPGs, and 15 chapter PNGs.
- Produces one cover, 8 gallery images, and 15 numbered chapter pages.

- [ ] Copy source chapter pages to a temporary `chapter-001` directory.
- [ ] Convert the banner and gallery JPGs with `cwebp -quiet -q 85`.
- [ ] Run `bun run manga:sanitize <temporary chapter-001> --quality 85` and copy numbered WebPs into the public archive.
- [ ] Verify output counts and representative image dimensions.

### Task 2: Add content entries

**Files:**
- Create: `src/content/manga/series/kamiina-botan-yoeru-sugata-wa-yuri-no-hana.md`
- Create: `src/content/manga/chapters/kamiina-botan-yoeru-sugata-wa-yuri-no-hana-chapter-001.md`

**Interfaces:**
- Consumes optimized paths from Task 1 and the supplied synopsis/credits.
- Produces published content consumed by the existing manga routes.

- [ ] Add the ongoing series metadata, synopsis, credits, aliases, tags, cover, and 8 gallery references.
- [ ] Add Chapter 001 with 15 WebP pages, RTL direction, and the dominant source dimensions.

### Task 3: Verify and publish

**Files:**
- Modify: `.openai/hosting.json` only if required by the existing Sites project (expected: no change).

- [ ] Run `bun test && bun run build`.
- [ ] Confirm the two Kamiina Botan routes and all 24 optimized assets exist.
- [ ] Push the exact validated source state and save/deploy a private Sites version.
