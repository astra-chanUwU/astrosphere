# Dorohedoro Manga Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and publish the supplied Dorohedoro series, artwork, and Chapter 001 in the existing Astro manga archive.

**Architecture:** Follow the established file-backed Astro content collections. Store optimized assets under `public/manga/dorohedoro`, reference them from one series entry and one chapter entry, then validate with the existing guard and production build before Sites deployment.

**Tech Stack:** Astro 7, Markdown content collections, Bun, cwebp, Pagefind, Sites hosting.

## Global Constraints

- Preserve the existing content schema and URL conventions.
- Keep the series published only when every referenced local asset exists.
- Convert chapter pages to sequential WebP files using the repository sanitizer at quality 85.
- Do not modify unrelated manga entries or shared UI.

---

### Task 1: Prepare optimized Dorohedoro assets

**Files:**
- Create: `public/manga/dorohedoro/cover.webp`
- Create: `public/manga/dorohedoro/art/*.webp`
- Create: `public/manga/dorohedoro/chapter-001/*.webp`

**Interfaces:**
- Consumes: `/Users/astrochan/Downloads/dorohedoro/banner.jpg`, `art/*.jpg`, and `chapter-001/*.{jpeg,jpg,png,webp}`.
- Produces: optimized assets matching the content paths below.

- [ ] **Step 1: Copy source assets into a writable staging directory.**

- [ ] **Step 2: Convert cover and gallery images to WebP with the installed image optimizer.**

- [ ] **Step 3: Run `bun run manga:sanitize /Users/astrochan/Downloads/dorohedoro/chapter-001 --quality 85` and copy the resulting numbered pages into the public asset path.**

- [ ] **Step 4: Verify the resulting asset count and dimensions.**

### Task 2: Add published content entries

**Files:**
- Create: `src/content/manga/series/dorohedoro.md`
- Create: `src/content/manga/chapters/dorohedoro-chapter-001.md`

**Interfaces:**
- Consumes: optimized assets from Task 1 and the supplied title, synopsis, credits, tags, and chapter details.
- Produces: published series and chapter entries consumed by the existing static routes.

- [ ] **Step 1: Add the series frontmatter with Hayashida Q credits, completed status, 2000 publication year, explicit rating, supplied synopsis, tags, cover, and 23 gallery references.**

- [ ] **Step 2: Add Chapter 001 frontmatter with number 1, 29 WebP pages, actual page dimensions, RTL direction, and published status.**

- [ ] **Step 3: Run the content type checker/build once to catch schema errors.**

### Task 3: Verify and publish

**Files:**
- Modify: `.openai/hosting.json` only if the Sites flow requires no existing project ID (expected: no change).

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces: verified production build and deployed site URL.

- [ ] **Step 1: Run the publishing guard test and production build.**

- [ ] **Step 2: Inspect the final diff and confirm only intended files changed.**

- [ ] **Step 3: Publish the exact validated source through the configured Sites project.**

- [ ] **Step 4: Check deployment status and report the live URL.**
