# Manga Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AstroSphere manga index, series detail page, vertical chapter reader, and SFW convenience warning flow.

**Architecture:** Astro static routes use the existing `mangaSeries` and `mangaChapters` collections. Shared helpers join and sort content, and derive zero-padded image URLs. A small local script powers the direct-route warning; image reading stays server-rendered HTML and native lazy loading.

**Tech Stack:** Astro 7, Content Collections, Zod, TypeScript, CSS, Bun tests.

---

### Task 1: Add reader data helpers and image dimensions

**Files:**
- Modify: `src/content.config.ts`
- Modify: `src/content/manga/chapters/witches-and-cigarettes-chapter-001.md`
- Modify: `src/lib/content.ts`
- Create: `src/lib/manga-reader.ts`
- Test: `tests/manga-reader.test.ts`

- [ ] **Step 1: Write failing pure helper tests**

Create tests for:

```ts
expect(createMangaPageSrc("/manga/witches-and-cigarettes/chapter-001", 1)).toBe("/manga/witches-and-cigarettes/chapter-001/001.jpg");
expect(createMangaPageSrc("/manga/witches-and-cigarettes/chapter-001", 31)).toBe("/manga/witches-and-cigarettes/chapter-001/031.jpg");
expect(sortMangaChapters([{ number: 10 }, { number: 1 }]).map((chapter) => chapter.number)).toEqual([1, 10]);
```

- [ ] **Step 2: Run the test**

Run: `bun test tests/manga-reader.test.ts`

Expected: FAIL because `src/lib/manga-reader.ts` does not exist.

- [ ] **Step 3: Implement minimal helper module**

Create `src/lib/manga-reader.ts`:

```ts
export type ChapterOrder = { number: number };
export const createMangaPageSrc = (pagePath: string, page: number) => `${pagePath}/${String(page).padStart(3, "0")}.jpg`;
export const sortMangaChapters = <T extends ChapterOrder>(chapters: T[]) => [...chapters].sort((left, right) => left.number - right.number);
```

- [ ] **Step 4: Add page dimensions to chapter data**

Add required `pageWidth` and `pageHeight` positive integers to `mangaChapterSchema`. Add `pageWidth: 1440` and `pageHeight: 2048` to the first chapter frontmatter.

- [ ] **Step 5: Add published manga queries**

In `src/lib/content.ts`, add `MangaSeriesEntry` and `MangaChapterEntry` aliases, `getPublishedMangaSeries()`, `getPublishedMangaChapters()`, and `getMangaChaptersForSeries(seriesSlug)`. Filter on `status === "published"` and sort chapters through `sortMangaChapters`.

- [ ] **Step 6: Verify**

Run: `bun test tests/manga-reader.test.ts && bunx astro check`

Expected: PASS with zero diagnostics.

### Task 2: Build reusable manga presentation components

**Files:**
- Create: `src/components/MangaSeriesCard.astro`
- Create: `src/components/MangaSeriesMeta.astro`
- Create: `src/components/MangaChapterList.astro`
- Create: `src/components/MangaContentWarning.astro`
- Create: `src/components/MangaReader.astro`
- Modify: `src/lib/content-rating.ts`
- Test: `tests/content-rating.test.ts`

- [ ] **Step 1: Extend the existing rating test**

Add:

```ts
expect(shouldRequireContentWarning("explicit", true, false)).toBe(true);
expect(shouldRequireContentWarning("explicit", false, false)).toBe(false);
expect(shouldRequireContentWarning("explicit", true, true)).toBe(false);
```

- [ ] **Step 2: Run the test**

Run: `bun test tests/content-rating.test.ts`

Expected: FAIL because `shouldRequireContentWarning` is not exported.

- [ ] **Step 3: Implement warning decision helper**

Add this to `src/lib/content-rating.ts`:

```ts
export const shouldRequireContentWarning = (rating: MangaRating, sfwEnabled: boolean, routeConfirmed: boolean) => rating === "explicit" && sfwEnabled && !routeConfirmed;
```

- [ ] **Step 4: Implement presentational components**

Build compact components using existing colors, fonts, and spacing:

- `MangaSeriesCard` renders a linked cover, English and original title, tags, and chapter count. Its outer element uses `data-manga-rating={series.data.rating}` so CSS hides explicit cards while `html[data-sfw="on"]`.
- `MangaSeriesMeta` renders creator links, publication year/status, tags, and description.
- `MangaChapterList` renders numerically sorted chapter links.
- `MangaReader` receives a chapter and series, renders its compact header and an ordered image sequence. Use `createMangaPageSrc`, declared chapter dimensions, `loading="eager"` plus `fetchpriority="high"` for page 1, and `loading="lazy"` for later pages.

- [ ] **Step 5: Implement direct-route warning component**

`MangaContentWarning` accepts `rating`. For explicit routes, wrap its slot in `[data-explicit-route]`. While `html[data-sfw="on"]` and the route is unconfirmed, CSS hides `.protected` and shows the warning. The Continue button sets `sessionStorage` key `astrosphere-adult-content-confirmed` to `true` and marks the current route confirmed. Listen for `astro:page-load` so it works with `ClientRouter`.

- [ ] **Step 6: Verify**

Run: `bun test tests/content-rating.test.ts && bunx astro check`

Expected: PASS.

### Task 3: Add manga routes and navigation

**Files:**
- Create: `src/pages/manga/index.astro`
- Create: `src/pages/manga/[slug].astro`
- Create: `src/pages/manga/[slug]/[chapter].astro`
- Modify: `src/components/SiteHeader.astro`
- Test: `tests/manga-routes.test.ts`

- [ ] **Step 1: Write failing route-shape checks**

Create source checks that require all three route files, `getStaticPaths` in both dynamic routes, and a `Manga` link in `SiteHeader.astro`.

- [ ] **Step 2: Run the test**

Run: `bun test tests/manga-routes.test.ts`

Expected: FAIL because the routes and navigation link do not exist.

- [ ] **Step 3: Add the index page**

`src/pages/manga/index.astro` calls `getPublishedMangaSeries()` and `getPublishedMangaChapters()`, computes a chapter count by series slug, and renders `MangaSeriesCard` for every published series. Explicit cards remain in static HTML but are hidden by the SFW preference CSS.

- [ ] **Step 4: Add the series page**

Generate static paths from `getPublishedMangaSeries()`. Retrieve the series by slug, retrieve its chapters through `getMangaChaptersForSeries()`, and compose `MangaContentWarning`, `MangaSeriesMeta`, and `MangaChapterList`. Return a 404 response for an impossible slug.

- [ ] **Step 5: Add the reader page**

Generate paths for every published chapter using `{ slug: chapter.data.series, chapter: chapter.data.slug }`. Retrieve the matching series and chapter, return 404 on mismatch, then compose `MangaContentWarning` and `MangaReader`.

- [ ] **Step 6: Add `Manga` to primary navigation**

Add `{ href: "/manga", label: "Manga" }` between `Artifacts` and `Work` in `SiteHeader.astro`.

- [ ] **Step 7: Verify**

Run: `bun test tests/manga-routes.test.ts && bunx astro check && bun run build`

Expected: static output includes `/manga/`, `/manga/witches-and-cigarettes/`, and `/manga/witches-and-cigarettes/witches-and-cigarettes-chapter-001/`.

### Task 4: Final verification

**Files:**
- Test: all `tests/*.test.ts`

- [ ] **Step 1: Run all verification**

Run:

```bash
bun test
bunx astro check
bun run build
```

Expected: all Bun tests pass, zero Astro diagnostics, and production build completes with all manga routes.
