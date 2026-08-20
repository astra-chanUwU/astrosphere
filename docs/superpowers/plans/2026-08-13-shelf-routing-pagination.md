# Shelf Routing and Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current all-items Shelf index with a personally curated `/shelf` landing page and static, no-JavaScript category archives paginated at 24 entries per page.

**Architecture:** A small Shelf configuration declares the ordered curated slugs and a shared content helper resolves only published, correctly classified entries. `/shelf` renders those selections, while separate first-page routes and Astro `paginate()` routes generate clean category URLs plus static later pages. A reusable pagination component owns accessible page navigation and constructs the canonical first-page URL itself.

**Tech Stack:** Astro 7 static routes and `paginate()`, Astro components, TypeScript, Bun tests, CSS custom-property design tokens.

## Global Constraints

- Keep the experience server-rendered and JavaScript-free.
- Use ordinary anchors for category and pagination navigation; add no client-side pagination, filtering, query state, or infinite scrolling.
- Set the archive page size to exactly `24` entries.
- Curate up to six entries per category through ordered configuration slugs; keep the two available image sets curated now.
- Keep all image-set binaries under `IMAGE_SET_MEDIA_ROOT` and their content URLs root-relative under `/media/images/`.
- Preserve existing explicit-content/SFW card behavior.
- Keep individual manga-series, chapter, and image-set-detail URLs unchanged.
- Change `futa-maid` from `format: manga` to `format: doujinshi`.
- `/manga` redirects permanently to `/shelf`; `/image-sets` redirects permanently to `/shelf/image-sets`.
- Do not modify Git state unless explicitly requested.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/config/shelf.ts` | Fixed page size and intentionally ordered Shelf curation slugs. |
| `src/lib/shelf.ts` | Category definitions, archive URL helpers, and published-entry selection/filtering. |
| `src/components/ShelfPagination.astro` | Accessible, ordinary-anchor page controls shared by all three archives. |
| `src/components/ShelfArchive.astro` | Category heading, count, cards, and pagination composition. |
| `src/pages/shelf/index.astro` | Curated Shelf landing page with three up-to-six-item sections. |
| `src/pages/shelf/<category>/index.astro` | Clean first page for each category archive. |
| `src/pages/shelf/<category>/page/[page].astro` | Statically generated pages 2+ for each category archive. |
| `src/pages/manga/index.astro` | Legacy 301 redirect only. |
| `src/pages/image-sets/index.astro` | Legacy 301 redirect only. |
| `src/config/navigation.ts` | `/shelf` navigation labels and contextual Shelf links. |
| `src/pages/manga/[slug].astro` | Series sidebar link to the Manga Shelf archive. |
| `src/pages/image-sets/[slug].astro` | Detail breadcrumbs/sidebar pointing at the new Shelf index/archive. |

### Task 1: Shelf configuration, category accessors, and the Futa Maid classification

**Files:**
- Create: `src/config/shelf.ts`
- Create: `src/lib/shelf.ts`
- Modify: `src/content/manga/series/futa-maid.md:11`
- Create: `tests/shelf-content.test.ts`

**Interfaces:**
- Produces `SHELF_PAGE_SIZE = 24` and `shelfConfig` with `mangaSlugs`, `doujinshiSlugs`, and `imageSetSlugs` ordered string arrays.
- Produces `ShelfCategory = "manga" | "doujinshi" | "image-sets"`.
- Produces `getShelfArchiveHref(category: ShelfCategory, page: number): string`; page 1 returns the category root and later pages return `/shelf/<category>/page/<page>`.
- Produces `getShelfSelections(): Promise<{ manga: MangaSeriesEntry[]; doujinshi: MangaSeriesEntry[]; imageSets: ImageSetEntry[] }>`.
- Produces `getShelfArchive(category: "manga" | "doujinshi"): Promise<MangaSeriesEntry[]>` and `getShelfArchive(category: "image-sets"): Promise<ImageSetEntry[]>`.

- [ ] **Step 1: Write the failing Shelf-content test**

```ts
import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const shelfConfig = await Bun.file(new URL("src/config/shelf.ts", root)).text().catch(() => "");
const shelfLibrary = await Bun.file(new URL("src/lib/shelf.ts", root)).text().catch(() => "");
const futaMaid = await Bun.file(new URL("src/content/manga/series/futa-maid.md", root)).text();

test("configures a personal Shelf and classifies Futa Maid as doujinshi", () => {
  expect(shelfConfig).toContain("export const SHELF_PAGE_SIZE = 24");
  expect(shelfConfig).toContain('"gushing-over-magical-girls"');
  expect(shelfConfig).toContain('"murcielago"');
  expect(shelfConfig).toContain('"sorry-but-im-not-into-yuri"');
  expect(shelfConfig).toContain('"ghost-in-the-shell"');
  expect(shelfConfig).toContain('"witches-and-cigarettes"');
  expect(shelfConfig).toContain('"yani-neko"');
  expect(shelfConfig).toContain('"adventurers-by-day-secretly-training-by-night"');
  expect(shelfConfig).toContain('"a-hard-debut"');
  expect(shelfConfig).toContain('"futa-maid"');
  expect(shelfConfig).toContain('"frill-no-shita-no-netsu"');
  expect(shelfConfig).toContain('"mav-dachiex"');
  expect(shelfConfig).toContain('"flou-sona"');
  expect(shelfConfig).toContain('"ndgd"');
  expect(futaMaid).toContain("format: doujinshi");
  expect(shelfLibrary).toContain("getShelfSelections");
  expect(shelfLibrary).toContain("getShelfArchiveHref");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test tests/shelf-content.test.ts`

Expected: FAIL because `src/config/shelf.ts` and `src/lib/shelf.ts` do not exist and `futa-maid.md` is still `format: manga`.

- [ ] **Step 3: Add the fixed configuration and classification**

```ts
export const SHELF_PAGE_SIZE = 24;

export const shelfConfig = {
  mangaSlugs: [
    "gushing-over-magical-girls", "murcielago", "sorry-but-im-not-into-yuri",
    "ghost-in-the-shell", "witches-and-cigarettes", "yani-neko",
  ],
  doujinshiSlugs: [
    "adventurers-by-day-secretly-training-by-night", "a-hard-debut", "futa-maid",
    "frill-no-shita-no-netsu", "mav-dachiex",
  ],
  imageSetSlugs: ["flou-sona", "ndgd"],
} as const;
```

Change the `format` line in `futa-maid.md` to `format: doujinshi`. In `src/lib/shelf.ts`, filter published manga series by that same format boundary, resolve selection slugs from a `Map`, preserve their configured order, ignore absent slugs, and return only category-valid entries. Implement `getShelfArchiveHref` with the page-one special case.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `bun test tests/shelf-content.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit: repository instructions prohibit Git state changes without explicit user authorization.

### Task 2: Accessible native pagination and reusable archive rendering

**Files:**
- Create: `src/components/ShelfPagination.astro`
- Create: `src/components/ShelfArchive.astro`
- Create: `tests/shelf-pagination.test.ts`

**Interfaces:**
- `ShelfPagination` consumes `{ category: ShelfCategory; currentPage: number; lastPage: number; }` and uses `getShelfArchiveHref` for every link.
- `ShelfArchive` consumes `{ category: ShelfCategory; entries: MangaSeriesEntry[] | ImageSetEntry[]; currentPage: number; lastPage: number; chapterCountBySeriesSlug: Map<string, number>; }` and renders `MangaSeriesCard` for Manga/Doujinshi and `ImageSetCard` for image sets.
- `ShelfPagination` renders a labelled `<nav>`, `aria-current="page"`, status text, and a compact first/current/nearby/last numeric range.

- [ ] **Step 1: Write the failing component test**

```ts
import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const pagination = await Bun.file(new URL("src/components/ShelfPagination.astro", root)).text().catch(() => "");
const archive = await Bun.file(new URL("src/components/ShelfArchive.astro", root)).text().catch(() => "");

test("Shelf pagination is accessible, link-based, and shares archive rendering", () => {
  expect(pagination).toContain('aria-label="Pagination"');
  expect(pagination).toContain("aria-current");
  expect(pagination).toContain("Previous");
  expect(pagination).toContain("Next");
  expect(pagination).toContain("Page {currentPage} of {lastPage}");
  expect(pagination).toContain("getShelfArchiveHref");
  expect(pagination).not.toContain("<script");
  expect(archive).toContain("MangaSeriesCard");
  expect(archive).toContain("ImageSetCard");
  expect(archive).toContain("ShelfPagination");
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test tests/shelf-pagination.test.ts`

Expected: FAIL because the Shelf pagination and archive components do not exist.

- [ ] **Step 3: Implement pagination and archive components**

Implement a page-number helper inside `ShelfPagination.astro` that always includes page 1 and `lastPage`, includes `currentPage - 1` through `currentPage + 1` when valid, sorts and deduplicates them, and inserts non-interactive ellipses for skipped ranges. Render Previous/Next only when their destination exists. Use links of the following form:

```astro
<a href={getShelfArchiveHref(category, pageNumber)} aria-current={pageNumber === currentPage ? "page" : undefined}>
  {pageNumber}
</a>
```

Give the `<nav>` a visible focus style based on the existing `var(--color-accent)`, `var(--color-border)`, and `var(--color-muted)` tokens. `ShelfArchive.astro` must use category-specific headings, counts, cards, and a no-entry empty state; it must pass `chapterCount` to every manga card using the published chapter list supplied by the archive route.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `bun test tests/shelf-pagination.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit: repository instructions prohibit Git state changes without explicit user authorization.

### Task 3: Curated Shelf and static category archive routes

**Files:**
- Create: `src/pages/shelf/index.astro`
- Create: `src/pages/shelf/manga/index.astro`
- Create: `src/pages/shelf/manga/page/[page].astro`
- Create: `src/pages/shelf/doujinshi/index.astro`
- Create: `src/pages/shelf/doujinshi/page/[page].astro`
- Create: `src/pages/shelf/image-sets/index.astro`
- Create: `src/pages/shelf/image-sets/page/[page].astro`
- Create: `tests/shelf-routes.test.ts`

**Interfaces:**
- `/shelf` calls `getShelfSelections()` and renders ordered curation with “Browse all” links to all three archive roots.
- Each category first page slices `entries.slice(0, SHELF_PAGE_SIZE)` and supplies `{ currentPage: 1, lastPage: Math.ceil(entries.length / SHELF_PAGE_SIZE) }` to `ShelfArchive`.
- Each later-page route calls Astro `paginate(entries, { pageSize: SHELF_PAGE_SIZE })`, filters out the generated first page, and passes the returned `page.data`, `page.currentPage`, and `page.lastPage` to `ShelfArchive`.

- [ ] **Step 1: Write the failing archive-route test**

```ts
import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const shelf = await Bun.file(new URL("src/pages/shelf/index.astro", root)).text().catch(() => "");
const manga = await Bun.file(new URL("src/pages/shelf/manga/index.astro", root)).text().catch(() => "");
const mangaPages = await Bun.file(new URL("src/pages/shelf/manga/page/[page].astro", root)).text().catch(() => "");
const doujinshiPages = await Bun.file(new URL("src/pages/shelf/doujinshi/page/[page].astro", root)).text().catch(() => "");
const imageSetPages = await Bun.file(new URL("src/pages/shelf/image-sets/page/[page].astro", root)).text().catch(() => "");

test("defines a curated Shelf and static later pages for every category", () => {
  expect(shelf).toContain("getShelfSelections");
  expect(shelf).toContain('href="/shelf/manga"');
  expect(shelf).toContain('href="/shelf/doujinshi"');
  expect(shelf).toContain('href="/shelf/image-sets"');
  expect(manga).toContain("SHELF_PAGE_SIZE");
  for (const pageRoute of [mangaPages, doujinshiPages, imageSetPages]) {
    expect(pageRoute).toContain("getStaticPaths");
    expect(pageRoute).toContain("paginate(");
    expect(pageRoute).toContain("SHELF_PAGE_SIZE");
    expect(pageRoute).not.toContain("<script");
  }
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test tests/shelf-routes.test.ts`

Expected: FAIL because the `/shelf` routes do not exist.

- [ ] **Step 3: Implement the curated landing page and all six archive route files**

Use the current `/manga` page’s editorial header and section styling as the visual baseline, but render only `getShelfSelections()` results on `/shelf`. Do not derive the landing page from sort order. For each category index route, load its archive with `getShelfArchive`, load published chapters when rendering manga/doujinshi, and give `ShelfArchive` page-one data.

For each `page/[page].astro` route, use this static-path shape so Astro creates only pages 2 and later:

```ts
import type { GetStaticPaths } from "astro";

export const getStaticPaths = (async ({ paginate }) => {
  const entries = await getShelfArchive("manga");
  return paginate(entries, { pageSize: SHELF_PAGE_SIZE })
    .filter((path) => Number(path.params.page) > 1);
}) satisfies GetStaticPaths;
```

Use the category-specific archive function in each route. Preserve the static 404 behavior by returning no path for invalid page numbers. The archive component’s link helper, rather than Astro’s `page.url.first`, owns the clean first-page URL.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `bun test tests/shelf-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit: repository instructions prohibit Git state changes without explicit user authorization.

### Task 4: Redirect legacy indexes and update internal navigation

**Files:**
- Modify: `src/pages/manga/index.astro`
- Modify: `src/pages/image-sets/index.astro`
- Modify: `src/config/navigation.ts`
- Modify: `src/pages/manga/[slug].astro`
- Modify: `src/pages/image-sets/[slug].astro`
- Modify: `tests/shelf-page.test.ts`
- Modify: `tests/manga-routes.test.ts`
- Modify: `tests/image-set-routes.test.ts`
- Modify: `tests/sidebar.test.ts`

**Interfaces:**
- Legacy index routes return `Astro.redirect("/shelf", 301)` and `Astro.redirect("/shelf/image-sets", 301)` respectively.
- Global navigation exposes a `/shelf` destination labelled “Shelf”.
- Shelf contextual navigation and detail-page archive links use the new canonical Shelf URLs.

- [ ] **Step 1: Write failing redirect and navigation assertions**

```ts
test("moves the Shelf index and image-set archive to canonical Shelf URLs", () => {
  expect(legacyMangaIndex).toContain('Astro.redirect("/shelf", 301)');
  expect(legacyImageSetIndex).toContain('Astro.redirect("/shelf/image-sets", 301)');
  expect(navigation).toContain('{ href: "/shelf", label: "Shelf" }');
  expect(seriesRoute).toContain('href: "/shelf/manga"');
  expect(imageSetDetail).toContain('href: "/shelf"');
  expect(imageSetDetail).toContain('href: "/shelf/image-sets"');
});
```

Load `legacyMangaIndex`, `legacyImageSetIndex`, `seriesRoute`, and `imageSetDetail` from their exact source files at the top of the existing route/source tests. Remove assertions that require `/manga` to be an archive implementation.

- [ ] **Step 2: Run the focused test set to verify it fails**

Run: `bun test tests/shelf-page.test.ts tests/manga-routes.test.ts tests/image-set-routes.test.ts tests/sidebar.test.ts`

Expected: FAIL because legacy archive files still render content and navigation uses `/manga` or `/image-sets`.

- [ ] **Step 3: Implement redirects and update all internal index links**

Replace both legacy index page bodies with only a frontmatter `return Astro.redirect(destination, 301);`. Update primary, sidebar, home, and archive navigation to call the destination “Shelf” and link to `/shelf`. Update the manga-series sidebar’s all-items link to `/shelf/manga`. Update image-set detail breadcrumbs and sidebar links to `/shelf` and `/shelf/image-sets`. Keep individual series, chapters, and image-set detail permalink targets unchanged.

- [ ] **Step 4: Run the focused test set to verify it passes**

Run: `bun test tests/shelf-page.test.ts tests/manga-routes.test.ts tests/image-set-routes.test.ts tests/sidebar.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit: repository instructions prohibit Git state changes without explicit user authorization.

### Task 5: Build-level verification

**Files:**
- Modify: only files required to correct a failing verification assertion from Tasks 1–4.

**Interfaces:**
- The generated static site contains `/shelf/index.html` and each category’s `index.html`.
- When a category exceeds 24 entries, Astro generates `/shelf/<category>/page/2/index.html`.

- [ ] **Step 1: Run all Shelf-focused tests**

Run: `bun test tests/shelf-content.test.ts tests/shelf-pagination.test.ts tests/shelf-routes.test.ts tests/shelf-page.test.ts tests/manga-routes.test.ts tests/image-set-routes.test.ts tests/sidebar.test.ts`

Expected: PASS.

- [ ] **Step 2: Run regression tests for affected content and cards**

Run: `bun test tests/manga-schema.test.ts tests/manga-series-card.test.ts tests/image-set-content.test.ts tests/image-set-schema.test.ts tests/image-set-media-root.test.ts tests/publishing-guard.test.ts`

Expected: PASS.

- [ ] **Step 3: Type-check and build the static site**

Run: `bunx astro check && bun run build`

Expected: exit code 0; generated Shelf routes compile without client-side scripts.

- [ ] **Step 4: Inspect generated route output**

Run: `find dist/shelf -maxdepth 5 -name index.html | sort`

Expected: `/shelf/index.html`, `/shelf/manga/index.html`, `/shelf/doujinshi/index.html`, and `/shelf/image-sets/index.html`; page-2 directories appear once the relevant category contains more than 24 published entries.

- [ ] **Step 5: Commit**

Do not commit: repository instructions prohibit Git state changes without explicit user authorization.
