# Artifact Hero Frame Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep artifact hero images fully visible while capping their height so opening article text is visible beneath them.

**Architecture:** Keep shared media rendering unchanged. Add a hero-only wrapper and scoped rules in the artifact route, so gallery media and embeds retain their current dimensions. The wrapper provides a viewport-aware boundary; the contained image centers with `object-fit: contain` against the existing surface color.

**Tech Stack:** Astro 7, scoped component CSS, Bun test runner.

## Global Constraints

- Preserve the complete lead image; do not crop or distort it.
- Apply the new size limit only to artifact-page hero media.
- Keep the existing surface, border, caption, gallery, and non-image media behavior.

---

### Task 1: Add and verify the hero-only layout treatment

**Files:**
- Create: `tests/artifact-hero-frame.test.ts`
- Modify: `src/pages/artifacts/[slug].astro:16-17`

**Interfaces:**
- Consumes: the existing `artifact.data.hero` conditional and `MediaFrame` component.
- Produces: a `.hero-frame` wrapper that constrains only lead image media.

- [x] **Step 1: Write the failing structural test**

```ts
import { expect, test } from "bun:test";

const page = await Bun.file(new URL("../src/pages/artifacts/[slug].astro", import.meta.url)).text();

test("artifact heroes use a contained, viewport-aware frame", () => {
  expect(page).toContain('class="hero-frame"');
  expect(page).toMatch(/max-height:\\s*min\\(32svh,\\s*24rem\\)/);
  expect(page).toMatch(/object-fit:\\s*contain/);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `bun test tests/artifact-hero-frame.test.ts`

Expected: FAIL because the page does not yet contain the hero frame or its sizing rules.

- [x] **Step 3: Add the minimal route-level hero frame**

```astro
{artifact.data.hero && <div class="hero-frame"><MediaFrame media={artifact.data.hero} priority/></div>}

<style>
  .hero-frame { background: var(--color-surface); border: var(--border-width) solid var(--color-border); display: grid; max-height: min(32svh, 24rem); place-items: center; }
  .hero-frame :global(figure) { margin: 0; width: 100%; }
  .hero-frame :global(img) { border: 0; height: min(32svh, 24rem); margin-inline: auto; object-fit: contain; width: 100%; }
</style>
```

- [x] **Step 4: Run the focused test and production build**

Run: `bun test tests/artifact-hero-frame.test.ts && bun run build`

Expected: Both commands exit successfully; the built site contains the changed artifact route.

- [x] **Step 5: Inspect a tall-image artifact in the browser**

Run: `astro dev --background`, then view `/artifacts/virgin-of-the-rocks-paris-london` at a desktop viewport.

Expected: The entire lead image is visible, centered in its frame, with opening content directly below it and no changes to lower gallery media.

- [ ] **Step 6: Commit**

Stage `src/pages/artifacts/[slug].astro`, `tests/artifact-hero-frame.test.ts`, and this plan. Commit message: `fix: constrain artifact hero images`.
