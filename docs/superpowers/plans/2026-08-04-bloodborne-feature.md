# Bloodborne Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a published, image-led Bloodborne essay to the Games sphere with a careful official ShadPS4 reference.

**Architecture:** The feature is one Markdown artifact following the existing Games essay pattern. Its local public images are referenced from frontmatter and Markdown, allowing the existing publishing guard to validate every asset at build time.

**Tech Stack:** Astro 7 content collections, Markdown, Bun tests, static public assets.

## Global Constraints

- Use only supplied local images under `public/media/games/bloodborne/`.
- Preserve the user’s manual-commit workflow; do not commit or push.
- Link ShadPS4 only at `https://shadps4.net/`; include no piracy instructions or compatibility claims.
- Credit third-party images as identification and critical-commentary material.

---

### Task 1: Lock the content contract with a failing test

**Files:**
- Create: `tests/bloodborne-feature.test.ts`
- Test: `tests/bloodborne-feature.test.ts`

**Interfaces:**
- Consumes: `src/content/artifacts/essays/bloodborne-still-hunts.md`
- Produces: a regression check for required Games metadata and official source link.

- [ ] **Step 1: Write the failing test**

```ts
test("publishes the Bloodborne feature with local media and the official ShadPS4 link", () => {
  expect(article).toContain("spheres: [games]");
  expect(article).toContain("https://shadps4.net/");
  expect(article).toContain("/media/games/bloodborne/");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/bloodborne-feature.test.ts`

Expected: failure because the feature file does not exist yet.

- [ ] **Step 3: Commit**

Do not commit automatically. Leave the new test for the user’s manual commit.

### Task 2: Copy and name the supplied media

**Files:**
- Create: `public/media/games/bloodborne/main-menu-banner.jpeg`
- Create: `public/media/games/bloodborne/arcane-level-up.avif`
- Create: `public/media/games/bloodborne/weapons-sheet.jpeg`
- Create: `public/media/games/bloodborne/bone-ash-reference.jpg`
- Create: `public/media/games/bloodborne/bone-ash-concept.jpg`
- Create: `public/media/games/bloodborne/choir-helm.jpeg`
- Create: `public/media/games/bloodborne/choir-garb.jpeg`
- Create: `public/media/games/bloodborne/cleric-beast-fight.webp`
- Create: `public/media/games/bloodborne/threaded-cane-action.jpg`
- Create: `public/media/games/bloodborne/old-hunters-weapons.jpeg`
- Create: `public/media/games/bloodborne/call-beyond-banner.jpg`
- Create: `public/media/games/bloodborne/darkbeast-fight.jpeg`

**Interfaces:**
- Produces: root-relative media URLs consumed by the artifact frontmatter and body.

- [ ] **Step 1: Copy the supplied images without resizing or re-encoding**

```sh
mkdir -p public/media/games/bloodborne
cp /Users/astrochan/Downloads/bloodborne-main-menu-banner.jpeg public/media/games/bloodborne/main-menu-banner.jpeg
```

- [ ] **Step 2: Confirm all 12 named files exist**

Run: `rg --files public/media/games/bloodborne`

Expected: the 12 listed filenames.

- [ ] **Step 3: Commit**

Do not commit automatically. Leave the media files for the user’s manual commit.

### Task 3: Publish the Bloodborne artifact

**Files:**
- Create: `src/content/artifacts/essays/bloodborne-still-hunts.md`
- Test: `tests/bloodborne-feature.test.ts`

**Interfaces:**
- Consumes: the 12 local media assets from Task 2.
- Produces: a static route at `/artifacts/bloodborne-still-hunts/`.

- [ ] **Step 1: Add frontmatter and essay body**

```md
---
slug: bloodborne-still-hunts
title: Bloodborne Still Hunts
type: essay
status: published
spheres: [games]
sourceUrl: https://shadps4.net/
---
```

The body covers weapon transformation, Yharnam’s visual language, CRT play, the absence of a remake/remaster, and a legal-use-only official ShadPS4 link. It credits each image and includes a third-party-material note.

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `bun test tests/bloodborne-feature.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

Do not commit automatically. Leave the artifact and test for the user’s manual commit.

### Task 4: Validate published output

**Files:**
- Verify: `src/content/artifacts/essays/bloodborne-still-hunts.md`
- Verify: `public/media/games/bloodborne/`

- [ ] **Step 1: Run all tests**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 2: Run Astro content diagnostics**

Run: `bunx astro check`

Expected: 0 errors, 0 warnings, 0 hints.

- [ ] **Step 3: Build static output**

Run: `bun run build`

Expected: successful route generation including `/artifacts/bloodborne-still-hunts/`.

- [ ] **Step 4: Commit**

Do not commit automatically. Report the verification result and let the user commit manually.
