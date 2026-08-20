# Manga Creator Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace copied Mangadex creator links with stable internal creator pages listing the manga associated with each author or artist.

**Architecture:** Store an explicit creator slug alongside each creator name in manga frontmatter. Add a reusable creator index helper that groups published manga series by creator, then render static `/manga/creators/[slug]` pages from that index. The series metadata component links creator names to those pages and never renders external creator URLs.

**Tech Stack:** Astro 7, TypeScript, Zod content schemas, Markdown frontmatter, Bun tests.

## Global Constraints

- Work directly on the main branch.
- Do not run Git commands or modify Git state.
- Creator links in manga frontmatter must be internal creator slugs, not copied external Mangadex URLs.
- Preserve authors and artists as separate credited roles, including creators credited in both roles.

---

### Task 1: Define and test the creator data contract

**Files:**
- Modify: `src/content.config.ts`
- Modify: `tests/manga-schema.test.ts`

- [ ] **Step 1: Write the failing test** asserting the creator schema requires `slug` and no longer defines `url`.
- [ ] **Step 2: Run `bun test tests/manga-schema.test.ts` and confirm the new assertion fails.**
- [ ] **Step 3: Change `creatorSchema` to `{ name: z.string().min(1), slug: slugSchema }`.
- [ ] **Step 4: Run the schema test and confirm it passes.**

### Task 2: Add creator indexing and creator-page route coverage

**Files:**
- Create: `src/lib/manga-creators.ts`
- Create: `src/pages/manga/creators/[slug].astro`
- Create: `tests/manga-creators.test.ts`
- Modify: `tests/manga-routes.test.ts`

- [ ] **Step 1: Write failing tests for grouping published series by creator, preserving `author`/`artist` roles, and defining the static creator route.
- [ ] **Step 2: Run the focused tests and confirm they fail because the helper and route do not exist.
- [ ] **Step 3: Implement `getMangaCreators(series)` and a static creator page using `getStaticPaths`, with a 404 for unknown slugs and links back to each series.
- [ ] **Step 4: Run the focused tests and confirm they pass.

### Task 3: Render internal creator links in manga metadata

**Files:**
- Modify: `src/components/MangaSeriesMeta.astro`
- Modify: `tests/manga-series-navigation.test.ts`

- [ ] **Step 1: Add a failing test requiring author and artist metadata to link to `/manga/creators/{slug}`.
- [ ] **Step 2: Run the focused test and confirm it fails against the current `person.url` rendering.
- [ ] **Step 3: Update the component to render each creator’s `name` as an internal link using `person.slug`.
- [ ] **Step 4: Run the focused test and confirm it passes.

### Task 4: Migrate manga frontmatter and document the rule

**Files:**
- Modify: `src/content/manga/series/*.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Add a regression check that no manga series frontmatter contains Mangadex author URLs and every creator entry has a slug.
- [ ] **Step 2: Run it and confirm it fails on the existing copied URLs and missing creator URLs.
- [ ] **Step 3: Replace all creator URLs with explicit slugs, including creators currently missing URLs.
- [ ] **Step 4: Add the project rule to `AGENTS.md`: manga authors/artists use `{ name, slug }` and internal creator pages; do not paste Mangadex creator URLs into frontmatter.
- [ ] **Step 5: Run the migration test and confirm it passes.

### Task 5: Verify the complete Astro build

**Files:**
- No additional files.

- [ ] **Step 1: Run `bun test`.
- [ ] **Step 2: Run `bun run build`.
- [ ] **Step 3: Confirm both commands exit successfully and that creator pages are generated under `dist/manga/creators/`.

### Task 6: Reuse manga cards on creator pages

**Files:**
- Modify: `src/components/MangaSeriesCard.astro`
- Modify: `src/pages/manga/creators/[slug].astro`
- Modify: `tests/manga-series-card.test.ts`
- Modify: `tests/manga-routes.test.ts`

- [ ] **Step 1: Write failing assertions for internal author/artist links in the shared card and `MangaSeriesCard` usage on creator pages.
- [ ] **Step 2: Run the focused tests and confirm they fail against the current plain creator list and card without credits.
- [ ] **Step 3: Add a compact credits line to the shared card and render filtered published series through it on creator pages with chapter counts.
- [ ] **Step 4: Run the focused tests and confirm they pass.
- [ ] **Step 5: Run `bun test` and `bun run build`.
