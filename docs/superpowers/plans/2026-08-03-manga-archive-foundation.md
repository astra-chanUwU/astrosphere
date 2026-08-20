# Manga Archive Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a scalable, static-first manga archive data model, beginning with *Majo to Kyurasu / Witches and Cigarettes* chapter 1 and an SFW discovery preference.

**Architecture:** Keep image pages as ordinary static files under `public/manga/`. Store series and chapter metadata in separate Markdown Content Collections. The future reader derives predictable page URLs from each chapter's `pagePath` and `pageCount`; no image paths are copied into frontmatter. The SFW preference is a localStorage-backed convenience filter only, never access control.

**Tech Stack:** Astro 7 Content Layer, Zod schemas, Markdown frontmatter, Bun tests, static public assets.

---

### Task 1: Normalize the supplied chapter pages

**Files:**
- Move: `public/witches-and-cigarettes/Unknown-*.jpg`
- Create: `public/manga/witches-and-cigarettes/chapter-001/001.jpg` through `031.jpg`

- [ ] **Step 1: Confirm page count and image dimensions**

Run:

```bash
find public/witches-and-cigarettes -maxdepth 1 -name 'Unknown-*.jpg' | wc -l
sips -g pixelWidth -g pixelHeight public/witches-and-cigarettes/Unknown-1.jpg
```

Expected: 31 image files; record the dimensions for later reader sizing.

- [ ] **Step 2: Rename in numeric order**

Run this from the repository root:

```bash
mkdir -p public/manga/witches-and-cigarettes/chapter-001
for number in {1..31}; do
  padded=$(printf '%03d' "$number")
  mv "public/witches-and-cigarettes/Unknown-$number.jpg" "public/manga/witches-and-cigarettes/chapter-001/$padded.jpg"
done
rmdir public/witches-and-cigarettes
```

- [ ] **Step 3: Verify deterministic ordering**

Run:

```bash
find public/manga/witches-and-cigarettes/chapter-001 -maxdepth 1 -name '*.jpg' | sort
```

Expected: `001.jpg` first and `031.jpg` last.

### Task 2: Add manga-series and manga-chapter schemas

**Files:**
- Modify: `src/content.config.ts`
- Test: `tests/manga-schema.test.ts`

- [ ] **Step 1: Write failing schema expectations**

Create `tests/manga-schema.test.ts` that asserts the configuration contains collections named `mangaSeries` and `mangaChapters`, ratings `safe`, `suggestive`, and `explicit`, and chapter properties `series`, `number`, `pagePath`, and `pageCount`.

- [ ] **Step 2: Run the test**

Run: `bun test tests/manga-schema.test.ts`

Expected: FAIL because neither collection exists.

- [ ] **Step 3: Add the schemas and loaders**

Add these shared Zod structures to `src/content.config.ts`:

```ts
const creatorSchema = z.object({ name: z.string().min(1), url: z.url().optional() });
const mangaRatingSchema = z.enum(["safe", "suggestive", "explicit"]);
const mangaTagSchema = slugSchema;
```

Define `mangaSeries` fields: `slug`, `title`, `originalTitle`, `aliases`, `status` (`ongoing | completed | hiatus | cancelled`), `publicationYear`, `description`, `rating`, `tags`, `authors`, `artists`, `cover`, `featured`, `updatedAt`.

Define `mangaChapters` fields: `slug`, `series`, `number`, `title`, `publishedAt`, `pagePath`, `pageCount`, `readingDirection` (`rtl | ltr`), `status`.

Load Markdown files from `src/content/manga/series` and `src/content/manga/chapters`, and add both collections to `collections`.

- [ ] **Step 4: Verify**

Run: `bun test tests/manga-schema.test.ts && bunx astro check`

Expected: PASS with zero Astro diagnostics.

### Task 3: Add Witches and Cigarettes content records

**Files:**
- Create: `src/content/manga/series/witches-and-cigarettes.md`
- Create: `src/content/manga/chapters/witches-and-cigarettes-chapter-001.md`

- [ ] **Step 1: Create the series record**

Use this frontmatter:

```yaml
slug: witches-and-cigarettes
title: Witches and Cigarettes
originalTitle: Majo to Kyurasu
aliases: []
status: ongoing
publicationYear: 2025
description: Long ago, the talented witch Shien hid her apprentice Tama from the witch hunts and then disappeared. Hundreds of years later, the two finally reunite in modern-day Japan. However, Shien is no longer the same: a downer witch is sitting by the window, smoking a cigarette.
rating: explicit
tags: [erotica, comedy, magic, girls-love, drama, fantasy, slice-of-life]
authors:
  - name: Shibata Kouhei
    url: https://mangadex.org/author/3d715610-7244-4dec-ad30-ec9e2250e763/shibata-kouhei
artists:
  - name: Shibata Kouhei
    url: https://mangadex.org/author/3d715610-7244-4dec-ad30-ec9e2250e763/shibata-kouhei
cover:
  kind: image
  src: /manga/witches-and-cigarettes/chapter-001/001.jpg
  alt: Cover page for Witches and Cigarettes chapter 1
featured: false
```

- [ ] **Step 2: Create the chapter record**

Use this frontmatter:

```yaml
slug: witches-and-cigarettes-chapter-001
series: witches-and-cigarettes
number: 1
title: Chapter 1
pagePath: /manga/witches-and-cigarettes/chapter-001
pageCount: 31
readingDirection: rtl
status: published
```

- [ ] **Step 3: Verify content loading**

Run: `bunx astro check && bun run build`

Expected: PASS. The collection is valid even before reader routes exist.

### Task 4: Add the persistent SFW convenience preference

**Files:**
- Create: `src/lib/content-rating.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/SiteHeader.astro`
- Test: `tests/content-rating.test.ts`

- [ ] **Step 1: Write the failing pure-function test**

Create a test for `isVisibleWithSfwFilter(rating, sfwEnabled)` with these expectations:

```ts
expect(isVisibleWithSfwFilter("safe", true)).toBe(true);
expect(isVisibleWithSfwFilter("suggestive", true)).toBe(true);
expect(isVisibleWithSfwFilter("explicit", true)).toBe(false);
expect(isVisibleWithSfwFilter("explicit", false)).toBe(true);
```

- [ ] **Step 2: Run the test**

Run: `bun test tests/content-rating.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the filter helper**

Create `src/lib/content-rating.ts`:

```ts
export type MangaRating = "safe" | "suggestive" | "explicit";
export const isVisibleWithSfwFilter = (rating: MangaRating, sfwEnabled: boolean) => !sfwEnabled || rating !== "explicit";
```

- [ ] **Step 4: Add the header toggle**

Add an `sfw: on/off` button alongside the theme and CRT controls. Persist its value at `astrosphere-sfw`, initialize `data-sfw` before first paint, and preserve it in the existing `astro:before-swap` event. Dispatch `astrosphere:sfw-change` after a toggle.

- [ ] **Step 5: Verify**

Run: `bun test && bunx astro check && bun run build`

Expected: PASS with the SFW filter defaulting to enabled.

### Task 5: Validate references before reader UI

**Files:**
- Modify: `src/lib/validate-references.ts`
- Test: `tests/manga-references.test.ts`

- [ ] **Step 1: Write a failing validation case**

Add a test showing a chapter whose `series` does not match a manga-series slug produces a clear error naming the chapter and missing series.

- [ ] **Step 2: Extend the reusable validator**

Use `getCollection("mangaSeries")` and `getCollection("mangaChapters")`. Add a chapter-series relationship check and page-path validation that rejects non-root-relative paths and `pageCount` below 1.

- [ ] **Step 3: Verify the full foundation**

Run: `bun test && bunx astro check && bun run build`

Expected: all tests pass and the production build validates manga data before any reader pages are introduced.
