# Archive Pagination and Row-Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Artifacts and Trails into single-column static archives with 24-entry pages and shared accessible, no-JavaScript pagination.

**Architecture:** Generalize the Shelf pagination component to a route-neutral `ArchivePagination` component that accepts a base path. Add first-page and later-page static routes for both collections; first pages slice their ordered entries and later pages use Astro `paginate()` while omitting page 1. Artifact and Trail rows remain separate components, preserving their distinct metadata.

**Tech Stack:** Astro 7 static routes and `paginate()`, Astro components, TypeScript, Bun tests, existing CSS design tokens.

## Global Constraints

- Keep pagination server-rendered and JavaScript-free.
- Use ordinary anchors for page navigation; add no client-side filtering, query state, or infinite scrolling.
- Set both archive page sizes to exactly `24` entries.
- Keep `/artifacts` and `/trails` as canonical first-page URLs; generate later pages under `/page/<number>` only.
- Preserve artifact newest-first ordering and trail featured-first then title ordering before pagination.
- Keep Artifact, Trail, and TrailProgress detail URLs/behavior unchanged.
- Remove the Artifacts featured hero, random-action panel, type toolbar, and two-column grid.
- Preserve external media and SFW behavior through existing detail/card components.
- Do not modify Git state unless explicitly requested.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/components/ArchivePagination.astro` | Shared accessible pagination for Shelf, Artifacts, and Trails. |
| `src/components/ShelfArchive.astro` | Uses the neutral pager while preserving Shelf cards. |
| `src/components/ArtifactCard.astro` | Single-column artifact row for archive, tag, sphere, and related contexts. |
| `src/components/TrailCard.astro` | Trail row with global sequence number and route metadata. |
| `src/lib/archive.ts` | Archive route href builder and one shared `ARCHIVE_PAGE_SIZE = 24` constant. |
| `src/pages/artifacts/index.astro` | Clean Artifacts first page. |
| `src/pages/artifacts/page/[page].astro` | Artifacts static pages 2+. |
| `src/pages/trails/index.astro` | Clean Trails first page. |
| `src/pages/trails/page/[page].astro` | Trails static pages 2+. |
| `tests/archive-pagination.test.ts` | Route, card, and generic-pagination source contracts. |
| `tests/archive-index-pages.test.ts` | Removes nested-build timeout behavior. |

### Task 1: Generalize the shared pagination component

**Files:**
- Create: `src/lib/archive.ts`
- Create: `src/components/ArchivePagination.astro`
- Modify: `src/components/ShelfArchive.astro`
- Delete: `src/components/ShelfPagination.astro`
- Modify: `tests/shelf-pagination.test.ts`
- Create: `tests/archive-pagination.test.ts`

**Interfaces:**
- Produces `ARCHIVE_PAGE_SIZE = 24`.
- Produces `getArchivePageHref(basePath: string, page: number): string`; page 1 returns `basePath`, later pages return `${basePath}/page/${page}`.
- `ArchivePagination` consumes `{ basePath: string; currentPage: number; lastPage: number; }`.
- `ShelfArchive` consumes the same props it does now and passes the Shelf category root (`/shelf/manga`, `/shelf/doujinshi`, or `/shelf/image-sets`) as `basePath`.

- [ ] **Step 1: Write failing neutral-pagination tests**

```ts
import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const pager = await Bun.file(new URL("src/components/ArchivePagination.astro", root)).text().catch(() => "");
const archive = await Bun.file(new URL("src/lib/archive.ts", root)).text().catch(() => "");
const shelfArchive = await Bun.file(new URL("src/components/ShelfArchive.astro", root)).text();

test("uses one accessible route-neutral archive pager", () => {
  expect(archive).toContain("export const ARCHIVE_PAGE_SIZE = 24");
  expect(archive).toContain("getArchivePageHref");
  expect(pager).toContain('aria-label="Pagination"');
  expect(pager).toContain("aria-current");
  expect(pager).toContain("Previous");
  expect(pager).toContain("Next");
  expect(pager).toContain("getArchivePageHref");
  expect(pager).not.toContain("<script");
  expect(shelfArchive).toContain("ArchivePagination");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/shelf-pagination.test.ts tests/archive-pagination.test.ts`

Expected: FAIL because `ArchivePagination.astro` and `archive.ts` do not exist.

- [ ] **Step 3: Implement the neutral helper and component**

```ts
export const ARCHIVE_PAGE_SIZE = 24;

export function getArchivePageHref(basePath: string, page: number): string {
  return page === 1 ? basePath : `${basePath}/page/${page}`;
}
```

Move the existing page-number/ellipsis logic from `ShelfPagination` into `ArchivePagination`. Replace the category prop with `basePath`, use `getArchivePageHref(basePath, pageNumber)` for all links, retain the `lastPage >= 1` guard, accessible numeric labels, `aria-current`, and token-based keyboard focus styling. Update Shelf imports and its focused test; remove `ShelfPagination.astro` only after all consumers use `ArchivePagination`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test tests/shelf-pagination.test.ts tests/archive-pagination.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit: Git state requires explicit user authorization.

### Task 2: Artifact rows and static archive pages

**Files:**
- Modify: `src/components/ArtifactCard.astro`
- Modify: `src/pages/artifacts/index.astro`
- Create: `src/pages/artifacts/page/[page].astro`
- Modify: `tests/archive-pagination.test.ts`
- Modify: `tests/archive-index-pages.test.ts`

**Interfaces:**
- `/artifacts` loads `getPublishedArtifacts()`, renders `entries.slice(0, ARCHIVE_PAGE_SIZE)`, and passes `{ basePath: "/artifacts", currentPage: 1, lastPage }` to `ArchivePagination`.
- Later artifact pages call `paginate(entries, { pageSize: ARCHIVE_PAGE_SIZE })` and return only paths where `Number(path.params.page) > 1`.
- `ArtifactCard` remains `Props { artifact: CollectionEntry<"artifacts"> }` and renders type, linked title, summary, and publication date as one row.

- [ ] **Step 1: Add failing artifact archive assertions**

```ts
test("builds Artifacts as a uniform static row archive", () => {
  expect(artifactIndex).toContain("getPublishedArtifacts");
  expect(artifactIndex).toContain("ARCHIVE_PAGE_SIZE");
  expect(artifactIndex).toContain("entries.slice(0, ARCHIVE_PAGE_SIZE)");
  expect(artifactIndex).toContain('basePath="/artifacts"');
  expect(artifactIndex).not.toContain("featured-artifact");
  expect(artifactIndex).not.toContain("artifact-grid");
  expect(artifactPages).toMatch(/return\s+paginate\(entries,\s*\{\s*pageSize:\s*ARCHIVE_PAGE_SIZE\s*\}\)\s*\.filter\(\(path\)\s*=>\s*Number\(path\.params\.page\)\s*>\s*1\)/s);
  expect(artifactCard).toContain("artifact.data.type");
  expect(artifactCard).toContain("artifact.data.summary");
  expect(artifactCard).toContain("publishedAt");
});
```

Replace `tests/archive-index-pages.test.ts` nested build with source assertions for the Artifact and Trail page markers; do not spawn Astro from a Bun test.

- [ ] **Step 2: Run the artifact tests to verify they fail**

Run: `bun test tests/archive-pagination.test.ts tests/archive-index-pages.test.ts`

Expected: FAIL because `/artifacts/page/[page].astro` is absent and the existing index contains the featured/grid layout.

- [ ] **Step 3: Implement uniform Artifact rows and routes**

Keep `ArtifactCard`’s type/title/summary/date content but use a single row visual: one full-width article with a top border and modest vertical padding. Replace the index hero, random action, type index, featured section, and grid with a compact archive header, a single-column card list, and `ArchivePagination`.

Implement the later route with:

```ts
import type { GetStaticPaths } from "astro";

export const getStaticPaths = (async ({ paginate }) => {
  const entries = await getPublishedArtifacts();
  return paginate(entries, { pageSize: ARCHIVE_PAGE_SIZE })
    .filter((path) => Number(path.params.page) > 1);
}) satisfies GetStaticPaths;
```

The later route must use `page.data`, `page.currentPage`, and `page.lastPage` with `basePath="/artifacts"`.

- [ ] **Step 4: Run the artifact tests to verify they pass**

Run: `bun test tests/archive-pagination.test.ts tests/archive-index-pages.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit: Git state requires explicit user authorization.

### Task 3: Trail rows and static archive pages

**Files:**
- Create: `src/components/TrailCard.astro`
- Modify: `src/pages/trails/index.astro`
- Create: `src/pages/trails/page/[page].astro`
- Modify: `tests/archive-pagination.test.ts`
- Modify: `tests/archive-index-pages.test.ts`

**Interfaces:**
- `TrailCard` consumes `{ trail: CollectionEntry<"trails">; index: number; sphereNames: Map<string, string>; }` and numbers rows as `String(index + 1).padStart(2, "0")`.
- `/trails` orders published trails by `featured` descending then title ascending, renders the first 24 entries, and passes original indexes to `TrailCard`.
- Later pages use the same ordered entries with Astro `paginate()` and calculate global row index as `(page.currentPage - 1) * ARCHIVE_PAGE_SIZE + localIndex`.

- [ ] **Step 1: Add failing Trail archive assertions**

```ts
test("builds Trails as a globally numbered static row archive", () => {
  expect(trailIndex).toContain("ARCHIVE_PAGE_SIZE");
  expect(trailIndex).toContain("TrailCard");
  expect(trailIndex).toContain("trails.slice(0, ARCHIVE_PAGE_SIZE)");
  expect(trailIndex).toContain('basePath="/trails"');
  expect(trailPages).toMatch(/return\s+paginate\(trails,\s*\{\s*pageSize:\s*ARCHIVE_PAGE_SIZE\s*\}\)\s*\.filter\(\(path\)\s*=>\s*Number\(path\.params\.page\)\s*>\s*1\)/s);
  expect(trailPages).toContain("(page.currentPage - 1) * ARCHIVE_PAGE_SIZE");
  expect(trailCard).toContain("estimatedTime");
  expect(trailCard).toContain("items.length");
  expect(trailCard).toContain("Follow a route");
});
```

- [ ] **Step 2: Run the Trail tests to verify they fail**

Run: `bun test tests/archive-pagination.test.ts tests/archive-index-pages.test.ts`

Expected: FAIL because `TrailCard.astro` and the later Trail route are absent.

- [ ] **Step 3: Implement Trail rows and routes**

Extract each current trail card’s metadata into `TrailCard`. Retain the route introduction and total-route count in the first-page header, but replace the two-column `.trails` layout with a single full-width stack. The card owns the row number, featured state, metadata, sphere labels, title, summary, and link.

For later pages, calculate the global index in the map:

```astro
{page.data.map((trail, localIndex) => (
  <TrailCard
    {trail}
    index={(page.currentPage - 1) * ARCHIVE_PAGE_SIZE + localIndex}
    {sphereNames}
  />
))}
```

Use `ArchivePagination` with `basePath="/trails"`, preserve the existing sort expression, and generate no page-one dynamic path.

- [ ] **Step 4: Run the Trail tests to verify they pass**

Run: `bun test tests/archive-pagination.test.ts tests/archive-index-pages.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Do not commit: Git state requires explicit user authorization.

### Task 4: Full verification

**Files:**
- Modify: only files required to correct a failing verification assertion from Tasks 1–3.

**Interfaces:**
- Static output includes `dist/artifacts/index.html` and `dist/trails/index.html`.
- Later page directories exist when a collection contains more than 24 published entries.

- [ ] **Step 1: Run focused route and component tests**

Run: `bun test tests/shelf-pagination.test.ts tests/archive-pagination.test.ts tests/archive-index-pages.test.ts tests/sidebar.test.ts tests/tag-archives.test.ts`

Expected: PASS.

- [ ] **Step 2: Run content and layout regression tests**

Run: `bun test tests/artifact-hero-frame.test.ts tests/editorial-media-sizing.test.ts tests/sphere-page-document.test.ts tests/reader-dock.test.ts tests/publishing-guard.test.ts`

Expected: PASS.

- [ ] **Step 3: Type-check and produce the static site**

Run: `bunx astro check && bun run build`

Expected: exit code 0 with no Astro diagnostics.

- [ ] **Step 4: Inspect built archive paths**

Run: `find dist/artifacts dist/trails -maxdepth 4 -name index.html | sort`

Expected: both first-page index files; `/artifacts/page/2/index.html` appears because Artifacts already exceed 24 published entries, and later Trails pages appear when Trails exceed that threshold.

- [ ] **Step 5: Commit**

Do not commit: Git state requires explicit user authorization.
