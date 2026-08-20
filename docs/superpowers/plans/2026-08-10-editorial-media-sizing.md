# Editorial Media Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep hero, gallery, and inline post images legible and proportionate using CSS only.

**Architecture:** `MediaFrame` supplies a reusable, uncropped media surface. `MediaGallery` defines equal-height thumbnail stages for image-only galleries. The artifact route retains a contained hero stage, while global prose styles constrain Markdown images to a readable visual measure.

**Tech Stack:** Astro components, scoped CSS, global CSS, Bun tests.

## Global Constraints

- No client-side JavaScript or dependencies.
- Preserve complete images with `object-fit: contain`; do not crop editorial material.
- Keep the existing full-size image link.
- Do not modify Git state, per the workspace instructions.

---

### Task 1: Define image-frame sizing contracts

**Files:**

- Modify: `src/components/MediaFrame.astro`
- Modify: `src/components/MediaGallery.astro`
- Modify: `src/pages/artifacts/[slug].astro`
- Modify: `src/styles/global.css`
- Test: `tests/editorial-media-sizing.test.ts`

**Interfaces:**

- Consumes: the existing `Media` schema and `MediaFrame` markup.
- Produces: `.media-image`, `.gallery--images`, `.hero-frame`, and `.prose img` CSS contracts.

- [ ] **Step 1: Write the failing test**

```ts
test("uses separate uncropped sizing rules for hero, gallery, and prose images", () => {
  expect(mediaFrame).toContain('class="media-image"');
  expect(gallery).toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
  expect(gallery).toMatch(/object-fit:\s*contain/);
  expect(page).toMatch(/height:\s*clamp\(16rem,\s*42svh,\s*30rem\)/);
  expect(globalStyles).toMatch(/\.prose img\s*\{[^}]*max-inline-size:\s*min\(100%,\s*42rem\)/s);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/editorial-media-sizing.test.ts`

Expected: FAIL because these media-sizing contracts do not exist.

- [ ] **Step 3: Write minimal implementation**

Add the class to rendered image elements. Give image-only gallery items an uncropped `4 / 3` stage with `object-fit: contain`; center the image and use the surface color as its letterbox. Use a responsive contained hero stage. Limit prose image width to `42rem` without exceeding its container and center it.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run: `bun test tests/editorial-media-sizing.test.ts tests/artifact-hero-frame.test.ts tests/media-frame-full-size-link.test.ts`

Expected: PASS.

- [ ] **Step 5: Build the site**

Run: `bun run build`

Expected: exit code 0.
