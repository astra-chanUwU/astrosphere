# Image Full-Size Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a consistent, accessible full-size link to every rendered image.

**Architecture:** Add the link in `MediaFrame`, the shared renderer for artifact hero images and gallery images. The image-only conditional prevents the action from appearing on audio, video, iframe, or embed media.

**Tech Stack:** Astro 7, scoped component CSS, Bun test runner.

## Global Constraints

- Link every image to its original `media.src` in a new tab.
- Use visible `Open full size` copy without a second download control.
- Preserve captions, credits, and non-image media behavior.

---

### Task 1: Add the image-only full-size link

**Files:**
- Create: `tests/media-frame-full-size-link.test.ts`
- Modify: `src/components/MediaFrame.astro:6-18`

**Interfaces:**
- Consumes: `media.kind`, `media.src`, and the existing `Media` type.
- Produces: an image-only anchor with `href={media.src}`, `target="_blank"`, and `rel="noopener noreferrer"`.

- [x] **Step 1: Write the failing structural test**

```ts
import { expect, test } from "bun:test";

const component = await Bun.file(new URL("../src/components/MediaFrame.astro", import.meta.url)).text();

test("each rendered image provides a safe full-size link", () => {
  expect(component).toContain('media.kind === "image" && <a class="full-size-link"');
  expect(component).toContain('href={media.src}');
  expect(component).toContain('target="_blank"');
  expect(component).toContain('rel="noopener noreferrer"');
});
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `bun test tests/media-frame-full-size-link.test.ts`

Expected: FAIL because no full-size image link currently exists.

- [x] **Step 3: Add the minimal image-only link and scoped style**

```astro
{media.kind === "image" && <a class="full-size-link" href={media.src} target="_blank" rel="noopener noreferrer">Open full size</a>}

<style>
  .full-size-link { display: inline-block; font-size: var(--text-sm); margin-top: var(--space-1); }
</style>
```

- [x] **Step 4: Run the focused test, full suite, and production build**

Run: `bun test tests/media-frame-full-size-link.test.ts && bun test && bun run build`

Expected: All tests and the static build pass.

- [x] **Step 5: Inspect an artifact in the browser**

Run: `astro dev --background`, then view `/artifacts/virgin-of-the-rocks-paris-london`.

Expected: The hero image and gallery images show the link; no action appears on audio, video, iframes, or embeds.

- [ ] **Step 6: Commit**

Stage `src/components/MediaFrame.astro`, `tests/media-frame-full-size-link.test.ts`, and this plan. Commit message: `feat: link images to full size`.
