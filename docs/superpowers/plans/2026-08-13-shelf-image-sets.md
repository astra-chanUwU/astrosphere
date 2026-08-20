# The Shelf Image Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task with review checkpoints.

**Goal:** Make `/manga` a curated “The Shelf” hub with separate Manga, Doujinshi, and first-class Image sets sections, while keeping all gallery media external and the browsing experience server-rendered.

**Architecture:** Add an `imageSets` Astro content collection with a deliberately small metadata-and-gallery schema. Expose it through `/image-sets` and `/image-sets/[slug]`, and migrate the existing `type: image-set` entries out of `artifacts` into that collection. The Shelf will query manga formats and image sets independently and render three ordinary-link sections; no client-side filtering or tab state is needed.

**Tech Stack:** Astro 7, Astro content collections, TypeScript, Bun tests, external media roots.

## Global Constraints

- Keep all image-set binaries under `IMAGE_SET_MEDIA_ROOT`; frontmatter image URLs remain root-relative `/media/images/...` paths.
- Keep the feature JavaScript-free; use server-rendered sections and ordinary anchors.
- Preserve SFW filtering behavior for explicit entries.
- Keep manga creator links internal under `/manga/creators/{slug}`.
- Do not modify or discard unrelated pre-existing working-tree changes.

### Task 1: First-class image-set collection and content accessors

**Files:**
- Modify: `src/content.config.ts`
- Modify: `src/lib/content.ts`
- Modify: `src/types/content.ts`
- Create: `src/content/image-sets/*.md`
- Delete: existing `src/content/artifacts/**` entries whose frontmatter `type` is `image-set`, after their fields are migrated
- Test: `tests/image-set-schema.test.ts`, `tests/image-set-content.test.ts`

**Interfaces:**
- Produce `imageSetSchema`, `ImageSetEntry`, `getPublishedImageSets()`, and `getImageSetBySlug(slug)`.
- `ImageSetEntry.data` includes `slug`, `title`, `status`, `summary`, `publishedAt`, `updatedAt?`, `tags`, `featured`, `rating`, `cover?`, `media[]`, `sourceUrl?`, `author?`, and `credits[]`.

- [ ] Write a failing schema test proving the collection is named `imageSets` and image-set media can use `/media/images/...` URLs.
- [ ] Run `bun test tests/image-set-schema.test.ts`; confirm it fails because the collection does not exist.
- [ ] Add the minimal `imageSetSchema` and `defineCollection` entry, and export the inferred type.
- [ ] Run the schema test and confirm it passes.
- [ ] Write a failing accessor test proving published image sets are sorted newest first and drafts are excluded.
- [ ] Run the focused accessor test and confirm it fails because the accessor is missing.
- [ ] Add `getPublishedImageSets()` and `getImageSetBySlug()` following the existing artifact access patterns.
- [ ] Migrate each existing image-set frontmatter file to `src/content/image-sets/`, remove article-only fields/body content, preserve gallery metadata and external URLs, and update publishing validation to read the new collection.
- [ ] Run the focused image-set tests plus the existing publishing-guard tests.

### Task 2: Image-set archive and detail routes

**Files:**
- Create: `src/pages/image-sets/index.astro`
- Create: `src/pages/image-sets/[slug].astro`
- Create: `src/components/ImageSetCard.astro`
- Create: `src/components/ImageSetGallery.astro`
- Modify: `src/config/navigation.ts`
- Test: `tests/image-set-routes.test.ts`, `tests/image-set-card.test.ts`

**Interfaces:**
- `/image-sets` renders a static archive of published `ImageSetEntry` values.
- `/image-sets/[slug]` renders metadata and a gallery, with every image linked to its full-size URL.
- Image-set cards expose title, summary, representative image, and a clear `Image set` label.

- [ ] Write failing route tests for the archive and dynamic detail route, including a 404 path for an unknown slug.
- [ ] Run the focused route tests and confirm they fail because the routes do not exist.
- [ ] Implement the archive, dynamic route, card, and gallery using existing BaseLayout, MediaFrame, content-rating, and full-size-link conventions.
- [ ] Add Image sets to contextual navigation without replacing the global Manga destination.
- [ ] Run focused route/card tests and inspect generated markup for ordinary anchors and no filter JavaScript.

### Task 3: The Shelf hub

**Files:**
- Modify: `src/pages/manga/index.astro`
- Modify: `src/components/MangaSeriesCard.astro`
- Modify: `src/config/navigation.ts`
- Test: `tests/shelf-page.test.ts`

**Interfaces:**
- `/manga` keeps its stable URL but renders the title “The Shelf”.
- Manga section contains entries with `format: manga`, `one-shot`, `artbook`, or `web-comic`.
- Doujinshi section contains entries with `format: doujinshi`.
- Image sets section contains curated image-set entries and links to `/image-sets`.

- [ ] Write a failing page test for the three section headings, section counts/links, and absence of a client-side filter control.
- [ ] Run the focused page test and confirm it fails against the current single-list page.
- [ ] Update the page to query image sets alongside manga/chapter collections and render the three editorial sections with empty-state copy.
- [ ] Add visible format labels to manga cards so the category remains clear inside the sections.
- [ ] Keep explicit-entry hiding compatible with the existing `data-manga-rating` SFW rule and apply the same server-rendered policy to image-set cards.
- [ ] Run the focused Shelf test and existing manga card tests.

### Task 4: Verification and review handoff

**Files:**
- Modify: only files required by failing focused tests or build output

- [ ] Run `bun test tests/image-set-schema.test.ts tests/image-set-content.test.ts tests/image-set-routes.test.ts tests/image-set-card.test.ts tests/shelf-page.test.ts`.
- [ ] Run the existing manga, publishing, media-root, and media-server test files.
- [ ] Run `bun run astro check` and `bun run build` with the configured external media roots.
- [ ] Review `git diff` and `git status` to confirm no image binaries entered the repository and unrelated pre-existing edits remain intact.
- [ ] Report the branch name, changed files, focused test results, and any baseline build-test timeout limitation before requesting approval to merge.
