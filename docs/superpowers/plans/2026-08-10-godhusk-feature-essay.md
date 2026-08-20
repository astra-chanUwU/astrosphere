# Godhusk Feature Essay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Publish a researched Godhusk feature essay with the supplied Plastiboo images and make it the AstroSphere homepage hero post.

**Architecture:** Add the supplied WebP files under `public/media/art/godhusk/`, create one published artifact using the existing `feature` layout and media schema, and update the homepage selection config to use the new artifact as its focus. No new components or dependencies are needed.

**Tech Stack:** Astro content collections, Markdown frontmatter, existing homepage configuration, static public assets.

## Global Constraints

- Work directly in the existing Astro project and preserve its content conventions.
- Credit Plastiboo, Hollow Press, Dogma, and the supplied image source context.
- Use the images for commentary and analysis, not as a substitute for the book.
- Keep the homepage focus selection pointed at exactly one published artifact.

---

### Task 1: Add the supplied image evidence

**Files:**
- Create: `public/media/art/godhusk/*.webp`

- [ ] Copy the twelve supplied WebP files into the Godhusk media directory with stable descriptive filenames.
- [ ] Confirm all twelve files exist and retain their dimensions.

### Task 2: Write and publish the essay

**Files:**
- Create: `src/content/artifacts/essays/godhusk-the-game-that-doesnt-exist.md`

- [ ] Add valid frontmatter for a published `essay` using `layout: feature`, the Godhusk cover as hero, `art` and `games` spheres, and descriptive tags.
- [ ] Write the article around the central argument that Godhusk creates the feeling of a lost game through a lore-book interface, distinguishing confirmed book text from interpretation.
- [ ] Add a compact image sequence using all supplied images with accessible alt text and credit captions.
- [ ] Include source links to Hollow Press, Plastiboo, Dogma’s video, and the U.S. Copyright Office fair-use guidance.

### Task 3: Make Godhusk the homepage feature

**Files:**
- Modify: `src/config/homepage.ts`

- [ ] Set `focusSlug` to `godhusk-the-game-that-doesnt-exist`.
- [ ] Keep the existing visual scrapbook and manga selections unchanged.

### Task 4: Validate and publish

**Files:**
- Validate: generated Astro build and published content references.

- [ ] Run the project build and fix only real content or asset issues.
- [ ] Publish the validated site through the existing Sites project.
- [ ] Confirm the deployed homepage and article URLs.
