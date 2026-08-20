# Tag Archives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create static tag archive pages and make all visible tags link to their matching archive.

**Architecture:** A generated Astro dynamic route will derive all known tags from the existing published-content helpers and render matched artifacts, manga series, and signals in type-specific sections. Existing display components will replace tag text spans with ordinary anchors to the route, so core navigation remains completely server-rendered and JavaScript-free.

**Tech Stack:** Astro 7, Astro content collections, TypeScript, Bun test runner, CSS.

## Global Constraints

- Generate routes only from published artifacts, published signals, and published manga series.
- Do not add JavaScript or dependencies for tag navigation.
- Preserve root-relative routes in the form `/tags/<tag>`.
- Work directly on `main`; do not stage, commit, branch, push, or otherwise change Git state.

---

### Task 1: Add reusable published tag-query helpers

**Files:**
- Modify: `src/lib/content.ts`
- Test: `tests/tag-archives.test.ts`

**Interfaces:**
- Produces: `getPublishedTags(): Promise<string[]>`, returning a sorted, duplicate-free set of tags from the three published collections.
- Produces: `getContentForTag(tag: string): Promise<{ artifacts: ArtifactEntry[]; manga: MangaSeriesEntry[]; signals: SignalEntry[] }>`, returning only entries whose tags include `tag`.
- Consumes: the existing `getPublishedArtifacts`, `getPublishedMangaSeries`, and `getPublishedSignals` helpers.

- [ ] **Step 1: Write the failing test**

```ts
test("collects tag results from published artifacts, manga, and signals", async () => {
  const content = await Bun.file(new URL("../src/lib/content.ts", import.meta.url)).text();

  expect(content).toContain("export async function getPublishedTags");
  expect(content).toContain("export async function getContentForTag");
  expect(content).toContain("getPublishedArtifacts()");
  expect(content).toContain("getPublishedMangaSeries()");
  expect(content).toContain("getPublishedSignals()");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/tag-archives.test.ts`

Expected: FAIL because the two tag query helpers do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function getPublishedTags(): Promise<string[]> {
  const [artifacts, manga, signals] = await Promise.all([
    getPublishedArtifacts(),
    getPublishedMangaSeries(),
    getPublishedSignals(),
  ]);

  return [...new Set([...artifacts, ...manga, ...signals].flatMap((entry) => entry.data.tags))]
    .sort((left, right) => left.localeCompare(right));
}

export async function getContentForTag(tag: string) {
  const [artifacts, manga, signals] = await Promise.all([
    getPublishedArtifacts(),
    getPublishedMangaSeries(),
    getPublishedSignals(),
  ]);

  return {
    artifacts: artifacts.filter((entry) => entry.data.tags.includes(tag)),
    manga: manga.filter((entry) => entry.data.tags.includes(tag)),
    signals: signals.filter((entry) => entry.data.tags.includes(tag)),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/tag-archives.test.ts`

Expected: PASS.

### Task 2: Build the generated tag archive route

**Files:**
- Create: `src/pages/tags/[tag].astro`
- Modify: `src/components/MangaSeriesCard.astro` only if the tag page needs a chapter-count-compatible card API
- Test: `tests/tag-archives.test.ts`

**Interfaces:**
- Consumes: `getPublishedTags()` and `getContentForTag(tag)` from `src/lib/content.ts`.
- Consumes: `ArtifactCard`, `MangaSeriesCard`, and `SignalCard` where their props can be supplied.
- Produces: one static page per known tag at `/tags/<tag>/`.

- [ ] **Step 1: Extend the failing test**

```ts
test("generates an accessible grouped archive page for each tag", async () => {
  const route = await Bun.file(new URL("../src/pages/tags/[tag].astro", import.meta.url)).text().catch(() => "");

  expect(route).toContain("getStaticPaths");
  expect(route).toContain("getPublishedTags");
  expect(route).toContain("getContentForTag(tag)");
  expect(route).toContain("<h1>Tag: {tag}</h1>");
  expect(route).toContain('id="artifacts-heading"');
  expect(route).toContain('id="manga-heading"');
  expect(route).toContain('id="signals-heading"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/tag-archives.test.ts`

Expected: FAIL because the dynamic route does not exist.

- [ ] **Step 3: Write minimal implementation**

Create a route that statically maps `getPublishedTags()` to `params.tag`, calls `getContentForTag(tag)`, computes `count`, and conditionally renders `section` elements for its non-empty artifact, manga, and signal collections. Use an ordinary `BaseLayout`; preserve the existing card components and obtain manga chapter counts with `getMangaChaptersForSeries`.

- [ ] **Step 4: Run the focused test and production build**

Run: `bun test tests/tag-archives.test.ts && bunx astro build`

Expected: PASS and successful static generation of tag pages.

### Task 3: Turn every existing visible tag into a no-JS link

**Files:**
- Modify: `src/components/ArtifactMeta.astro`
- Modify: `src/components/SignalCard.astro`
- Modify: `src/components/MangaSeriesMeta.astro`
- Modify: `src/components/MangaSeriesCard.astro`
- Modify: `tests/tag-archives.test.ts`

**Interfaces:**
- Consumes: each component’s existing tag string.
- Produces: anchor elements with `href={`/tags/${tag}`}` in each tag display.

- [ ] **Step 1: Extend the failing test**

```ts
test("renders visible tags as ordinary archive links", async () => {
  for (const component of [
    "src/components/ArtifactMeta.astro",
    "src/components/SignalCard.astro",
    "src/components/MangaSeriesMeta.astro",
    "src/components/MangaSeriesCard.astro",
  ]) {
    const source = await Bun.file(new URL(`../${component}`, import.meta.url)).text();
    expect(source).toContain("href={`/tags/${tag}`}");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/tag-archives.test.ts`

Expected: FAIL because the components still use tag spans or joined tag text.

- [ ] **Step 3: Write minimal implementation**

Replace every tag-only span or joined tag string with `map()` rendering that creates `<a href={`/tags/${tag}`}>{tag}</a>`. Keep the current typography and wrapping rules; add only minimal tag-link styling if needed to preserve readable, recognizable links.

- [ ] **Step 4: Run focused tests and full verification**

Run: `bun test tests/tag-archives.test.ts && bun test && bunx astro build`

Expected: all tests pass and the build emits no errors.
