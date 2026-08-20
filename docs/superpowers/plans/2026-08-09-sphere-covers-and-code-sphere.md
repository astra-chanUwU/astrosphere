# Sphere Covers and Code Sphere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optimized WebP cover images to the six public spheres, rename Independent Systems to Code Sphere, remove Artificial Nature, and keep published content references valid.

**Architecture:** Reuse the existing `cover` media schema and local `cwebp` workflow. Store six optimized assets under `public/media/spheres/`, render optional covers in `SphereCard.astro`, and keep the `independent-systems` slug stable while changing only its public title and summary.

**Tech Stack:** Astro 7, Astro content collections, Bun tests, Markdown/MDX, local `cwebp` at quality 85.

## Global Constraints

- Keep the `independent-systems` slug unchanged.
- Use the approved Code Sphere summary exactly.
- Convert supplied raster images with local `cwebp -quiet -q 85`.
- Use temporary conversion outputs, validate them as WebP, then rename them.
- Do not leave `artificial-nature` in published content references.
- Do not add dependencies.

---

### Task 1: Add failing tests

**Files:** Modify `tests/sphere-page-document.test.ts`; create `tests/sphere-card.test.ts`.

- [ ] Add a source-level test that reads `src/components/SphereCard.astro` and expects `sphere.data.cover`, `cover`, and `alt`.
- [ ] Update the page regression test to build `dist/spheres/independent-systems/index.html`, assert one document and main region, assert `Code Sphere`, the approved summary, and `/media/spheres/code-sphere.webp`, and assert `dist/spheres/artificial-nature/index.html` does not exist.
- [ ] Run `bun test tests/sphere-card.test.ts tests/sphere-page-document.test.ts`; expect failure because cover markup and content changes are not implemented.

### Task 2: Convert and install cover assets

**Files:** Create `public/media/spheres/code-sphere.webp`, `games.webp`, `anime.webp`, `old-internet.webp`, `art.webp`, and `iran.webp`.

- [ ] Confirm all six `/Users/astrochan/Downloads/*-sphere-pic.*` inputs with `file`.
- [ ] Create `public/media/spheres`.
- [ ] Convert with the established local utility at quality 85. Use `cwebp -quiet -q 85 source destination.tmp`; for the already-WebP inputs, copy them to `.webp.tmp` so all outputs are validated consistently.
- [ ] Validate every temporary output with `file` (must identify as WebP), rename to its final filename, and confirm final files with `file` and `du -h`. Never delete the Downloads originals.

### Task 3: Update content and remove stale references

**Files:** Modify the six public sphere Markdown files, `field-images.md`, `ways-of-entering.md`, `sensing-a-garden.md`, affected garden artifacts, `docs/content-model.md`; delete `src/content/spheres/artificial-nature.md`.

- [ ] Add the existing `cover` media object to Code, Games, Anime, Old Internet, Art, and Iran, using the six final WebP paths, meaningful alt text, and `Image supplied for the AstroSphere sphere cover.` as credit.
- [ ] Change Independent Systems’ title to `Code Sphere`, set the approved summary, set `accentLabel` to `Code, tools, and durable systems`, and set `shortLabel` to `Code`; keep slug `independent-systems`.
- [ ] Delete Artificial Nature and remove its parent metadata from Old Internet and Field Images.
- [ ] Remove Artificial Nature from published Ways of Entering; remove it from draft Sensing a Garden and use Field Images there if retaining a sphere list.
- [ ] Move published Slow Orbit to `independent-systems`; keep the published garden essay under `old-internet`; replace Artificial Nature in draft-only garden records with `field-images` where needed.
- [ ] Replace Artificial Nature examples in `docs/content-model.md` with current sphere slugs.
- [ ] Run `rg -n "artificial-nature" src docs tests` and `bunx astro check`; expect no matches and exit 0.

### Task 4: Render optional covers

**Files:** Modify `src/components/SphereCard.astro`; test `tests/sphere-card.test.ts`.

- [ ] Render an image only when `sphere.data.cover?.kind === "image"`, using `src`, `alt ?? sphere.data.title`, optional width/height, `loading="lazy"`, and `decoding="async"`.
- [ ] Add a scoped `.cover` style with `display: block`, `width: 100%`, `aspect-ratio: 16 / 9`, `object-fit: cover`, and spacing that preserves the existing card text/footer.
- [ ] Re-run the focused tests and expect both to pass.

### Task 5: Verify

- [ ] Run `bun test`.
- [ ] Run `bun run build`.
- [ ] Assert the Artificial Nature route is absent, generated sphere pages contain Code Sphere and WebP cover paths, and `rg -n "artificial-nature" src docs tests || true` returns no matches.
- [ ] Run `git diff --check` and `git status --short`; note that commits may remain blocked because `.git` is read-only.
