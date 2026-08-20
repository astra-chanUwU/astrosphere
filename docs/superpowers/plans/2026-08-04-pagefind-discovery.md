# Pagefind Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add static full-text archive discovery with Pagefind.

**Architecture:** Astro builds HTML first; the Pagefind CLI then indexes `dist` into `dist/pagefind`. Pages pass their search category, spheres, tags, and manga rating to `BaseLayout`, which emits Pagefind filter metadata. `/search` uses Pagefind’s browser API and honors the stored SFW setting.

**Tech Stack:** Astro 7, Bun, Pagefind, TypeScript, static HTML.

## Global Constraints

- Keep search fully static: no hosted index, backend, account, or analytics service.
- Search published artifacts, manga series, signals, spheres, and trails; do not index manga chapters separately.
- Hide explicit manga when `astrosphere-sfw` is not `off`.
- Preserve the user’s manual-commit workflow; do not commit or push.

---

### Task 1: Add a build-time Pagefind contract

**Files:**
- Modify: `package.json`
- Create: `tests/pagefind-discovery.test.ts`

- [ ] **Step 1: Write a failing test** checking that the build script invokes `pagefind --site dist` and a `/search` route exists.
- [ ] **Step 2: Run** `bun test tests/pagefind-discovery.test.ts` **and confirm failure because the search route is absent.**
- [ ] **Step 3: Install `pagefind` as a development dependency and change `build` to `astro build && pagefind --site dist`.**
- [ ] **Step 4: Run the focused test and confirm it passes.**

### Task 2: Supply index metadata and filters

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/artifacts/[slug].astro`
- Modify: `src/pages/manga/[slug].astro`
- Modify: `src/pages/spheres/[slug].astro`
- Modify: `src/pages/trails/[slug].astro`
- Modify: `src/pages/signals/index.astro`

- [ ] **Step 1: Extend `BaseLayout` with `pagefindFilters` and `indexForSearch` props.**
- [ ] **Step 2: Emit Pagefind metadata only for indexable pages; mark `/search` as ignored.**
- [ ] **Step 3: Pass category, sphere, tag, and manga-rating filter values from the detail pages.**
- [ ] **Step 4: Verify existing content pages still type-check.**

### Task 3: Build the search page

**Files:**
- Create: `src/pages/search.astro`
- Create: `src/scripts/pagefind-search.ts`
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/SiteSidebar.astro`

- [ ] **Step 1: Add visible Search links to desktop and mobile navigation.**
- [ ] **Step 2: Render a no-framework search page with an input, category buttons, sphere/tag selectors, result count, and results container.**
- [ ] **Step 3: Load `/pagefind/pagefind.js` after the page arrives, run `debouncedSearch`, render result metadata/excerpts, and apply an explicit-rating exclusion when SFW is on.**
- [ ] **Step 4: Reconnect the page after Astro client navigation via `astro:page-load`.**

### Task 4: Verify the static index

**Files:**
- Verify: `dist/pagefind/pagefind.js`
- Verify: `dist/search/index.html`

- [ ] **Step 1: Run** `bun test`.
- [ ] **Step 2: Run** `bunx astro check`.
- [ ] **Step 3: Run** `bun run build` **and confirm both search route and Pagefind assets are generated.**
