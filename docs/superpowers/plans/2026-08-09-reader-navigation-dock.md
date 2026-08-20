# Reader Navigation Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give manga chapters and artifact reading pages a compact fixed dock for progress, fast scrolling, and contextual navigation, with chapter controls at the start and end of manga chapters.

**Architecture:** `ReaderDock.astro` owns the accessible fixed controls and its page-lifecycle-safe browser behavior. `BaseLayout` opts individual pages in, while `SiteSidebar` exposes a stable target for the dock to open and focus. Manga route data supplies adjacent chapter URLs to `MangaReader`, which renders reusable chapter navigation in both locations.

**Tech Stack:** Astro 7 components, TypeScript, inline client-side browser script, CSS custom properties, Bun test.

## Global Constraints

- Preserve the current contextual sidebar as the only full site navigation menu.
- Use native buttons with accessible labels and 44px minimum touch targets.
- Honor `prefers-reduced-motion` for jump scrolling.
- Do not save reading positions, auto-advance chapters, add dependencies, or make Git changes.
- Preserve Astro client-router behavior by initializing on `astro:page-load` without accumulating listeners.

---

### Task 1: Add the shared reader dock

**Files:**
- Create: `src/components/ReaderDock.astro`
- Create: `tests/reader-dock.test.ts`

**Interfaces:**
- Consumes: sidebar elements marked with `data-reader-navigation` and a mobile `<details>` disclosure.
- Produces: `<ReaderDock />`, which renders a fixed dock with `data-reader-dock`, labelled progress, and top/end/navigation buttons.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";

const dock = await Bun.file(new URL("../src/components/ReaderDock.astro", import.meta.url)).text();

test("reader dock exposes progress, scroll shortcuts, and contextual navigation", () => {
  expect(dock).toContain('data-reader-dock');
  expect(dock).toContain('aria-label="Reading controls"');
  expect(dock).toContain('aria-label="Reading progress"');
  expect(dock).toContain('aria-label="Jump to the top"');
  expect(dock).toContain('aria-label="Jump to the end"');
  expect(dock).toContain('aria-label="Open page navigation"');
});

test("reader dock honors reduced motion and initializes after Astro navigation", () => {
  expect(dock).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
  expect(dock).toContain('document.addEventListener("astro:page-load", initializeReaderDock)');
  expect(dock).toContain('requestAnimationFrame(updateProgress)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/reader-dock.test.ts`

Expected: FAIL because `src/components/ReaderDock.astro` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `ReaderDock.astro` with a fixed `aside` that is initially hidden and contains a native `<progress>` element plus three `type="button"` controls. In an Astro client script:

```ts
const initializeReaderDock = () => {
  const dock = document.querySelector<HTMLElement>("[data-reader-dock]");
  const progress = document.querySelector<HTMLProgressElement>("[data-reader-progress]");
  const header = document.querySelector<HTMLElement>("[data-reader-header]");
  if (!dock || !progress || !header) return;

  const scrollBehavior = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  const updateProgress = () => {
    const maximum = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    progress.value = Math.round((window.scrollY / maximum) * 100);
    dock.hidden = header.getBoundingClientRect().bottom > 0;
  };

  dock.querySelector("[data-reader-top]")?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: scrollBehavior() }));
  dock.querySelector("[data-reader-end]")?.addEventListener("click", () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: scrollBehavior() }));
  dock.querySelector("[data-reader-navigation]")?.addEventListener("click", () => {
    const sidebar = document.querySelector<HTMLElement>("[data-reader-navigation]");
    const disclosure = sidebar?.querySelector<HTMLDetailsElement>("details");
    if (disclosure) disclosure.open = true;
    sidebar?.querySelector<HTMLElement>("nav")?.focus();
  });
  window.addEventListener("scroll", () => requestAnimationFrame(updateProgress), { passive: true });
  window.addEventListener("resize", () => requestAnimationFrame(updateProgress));
  requestAnimationFrame(updateProgress);
};

document.addEventListener("astro:page-load", initializeReaderDock);
```

Use different data attributes for the dock navigation button and sidebar target (`data-reader-open-navigation` and `data-reader-navigation`) to avoid selecting the button as the target. Style the dock as a small bottom-right cluster, with `min-height` and `min-width` of `2.75rem` for every button and no layout footprint.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/reader-dock.test.ts`

Expected: PASS.

### Task 2: Connect the dock to shared layout and sidebar

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/SiteSidebar.astro`
- Modify: `tests/sidebar.test.ts`

**Interfaces:**
- Consumes: `<ReaderDock />` from Task 1.
- Produces: `BaseLayout` prop `readerDock?: boolean`; stable `[data-reader-navigation]` sidebar target and focusable navigation landmark.

- [ ] **Step 1: Write the failing test**

Append to `tests/sidebar.test.ts`:

```ts
const dock = await Bun.file(new URL("../src/components/ReaderDock.astro", import.meta.url)).text();

test("layout can opt into the reader dock and sidebar exposes a focus target", () => {
  expect(layout).toContain("readerDock?: boolean");
  expect(layout).toContain("<ReaderDock />");
  expect(layout).toContain("readerDock &&");
  expect(sidebar).toContain("data-reader-navigation");
  expect(sidebar).toContain('tabindex="-1"');
  expect(dock).toContain('data-reader-open-navigation');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/sidebar.test.ts`

Expected: FAIL because the reader-dock layout prop and sidebar target are absent.

- [ ] **Step 3: Write minimal implementation**

In `BaseLayout.astro`, import `ReaderDock`, add `readerDock?: boolean` to `Props`, destructure it with a default of `false`, and render `{readerDock && <ReaderDock />}` after the site content. In `SiteSidebar.astro`, add `data-reader-navigation` to the outer `<aside>` and add `tabindex="-1"` to its `<nav>` so the dock can move keyboard focus into the existing navigation.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/sidebar.test.ts tests/reader-dock.test.ts`

Expected: PASS.

### Task 3: Add manga chapter controls and opt manga pages into the dock

**Files:**
- Modify: `src/components/MangaReader.astro`
- Modify: `src/pages/manga/[slug]/[chapter].astro`
- Modify: `tests/manga-reader.test.ts`

**Interfaces:**
- Consumes: `previousChapter?: { href: string; label: string }` and `nextChapter?: { href: string; label: string }` passed from the chapter page.
- Produces: reusable `chapter-navigation` rendered before and after `ol`, plus `data-reader-header` on the reader header.

- [ ] **Step 1: Write the failing test**

Append to `tests/manga-reader.test.ts`:

```ts
const reader = await Bun.file(new URL("../src/components/MangaReader.astro", import.meta.url)).text();
const chapterPage = await Bun.file(new URL("../src/pages/manga/[slug]/[chapter].astro", import.meta.url)).text();

test("manga reader renders previous, series, and next controls at both ends", () => {
  expect(reader).toContain("previousChapter?: ChapterLink");
  expect(reader).toContain("nextChapter?: ChapterLink");
  expect(reader).toContain('class="chapter-navigation"');
  expect(reader.match(/chapter-navigation/g)?.length).toBeGreaterThanOrEqual(2);
  expect(reader).toContain("data-reader-header");
});

test("manga chapter page supplies adjacent chapter links and opts into the dock", () => {
  expect(chapterPage).toContain("previousChapter={");
  expect(chapterPage).toContain("nextChapter={");
  expect(chapterPage).toContain("readerDock");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/manga-reader.test.ts`

Expected: FAIL because `MangaReader` accepts only series and chapter and the page has no reader-dock opt-in.

- [ ] **Step 3: Write minimal implementation**

Define a `ChapterLink` interface in `MangaReader.astro`, accept optional `previousChapter` and `nextChapter` props, and create a small local markup fragment containing conditional previous/next links plus an always-present `Series details` link. Render it immediately below the reader header and after the final `</ol>`. Give the header `data-reader-header`.

In the manga chapter page, create each link as `{ href: ..., label: ... }` from the existing `previous` and `next` entries; pass them into `<MangaReader>` and add `readerDock` to `<BaseLayout>`. Do not alter sidebar continuation controls.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/manga-reader.test.ts tests/sidebar.test.ts tests/reader-dock.test.ts`

Expected: PASS.

### Task 4: Opt artifact reading pages into the dock

**Files:**
- Modify: `src/pages/artifacts/[slug].astro`
- Modify: `tests/reader-dock.test.ts`

**Interfaces:**
- Consumes: `BaseLayout` `readerDock` prop from Task 2 and `[data-reader-header]` expected by Task 1.
- Produces: artifact page reader-dock opt-in and stable article-header visibility threshold.

- [ ] **Step 1: Write the failing test**

Append to `tests/reader-dock.test.ts`:

```ts
const artifactPage = await Bun.file(new URL("../src/pages/artifacts/[slug].astro", import.meta.url)).text();

test("artifact reading pages opt into the dock after their article header", () => {
  expect(artifactPage).toContain("readerDock");
  expect(artifactPage).toContain("data-reader-header");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/reader-dock.test.ts`

Expected: FAIL because the artifact layout invocation and header lack reader-dock markers.

- [ ] **Step 3: Write minimal implementation**

Add `readerDock` to the artifact `BaseLayout` invocation. Add `data-reader-header` to the artifact's top-level `<header>`. Keep the article content, metadata, and pagefind filters unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/reader-dock.test.ts tests/manga-reader.test.ts tests/sidebar.test.ts`

Expected: PASS.

### Task 5: Run full verification

**Files:**
- Modify: none unless a verification failure requires the smallest related fix.

**Interfaces:**
- Consumes: the dock and all integration points from Tasks 1–4.
- Produces: fresh evidence for test, type-check, and production-build status.

- [ ] **Step 1: Run the complete test suite**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 2: Run Astro type and integration checks**

Run: `bunx astro check`

Expected: exit code 0 with no errors.

- [ ] **Step 3: Run the production build**

Run: `bun run build`

Expected: exit code 0 and a generated `dist` site with Pagefind indexing.

- [ ] **Step 4: Inspect responsive behavior**

Run the local server using `astro dev --background`, then inspect one manga chapter and one artifact at desktop and 390px widths.

Expected: dock stays within viewport without horizontal overflow; controls are 44px or larger; navigation opens the sidebar disclosure on mobile; and previous/next chapter links appear at both ends of a manga chapter.
