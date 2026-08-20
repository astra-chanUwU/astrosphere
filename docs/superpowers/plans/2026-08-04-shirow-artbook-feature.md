# Shirow Masamune Artbook Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a published Shirow Masamune exhibition artbook feature with a local credited gallery.

**Architecture:** One Markdown artifact consumes a named local public-media directory. The existing publishing guard validates all frontmatter and body image references during Astro production builds.

**Tech Stack:** Astro content collections, Markdown, Bun tests, static public media.

## Global Constraints

- Use only the supplied images under `public/media/anime/shirow-masamune-artworks/`.
- Preserve the user’s manual-commit workflow; do not commit or push.
- Use `https://theghostintheshell.jp/en/news/shirow_masamune_artworks` as the official source.
- Credit all third-party images as identification and critical-commentary material.

---

### Task 1: Add an artifact contract test

**Files:**
- Create: `tests/shirow-artbook-feature.test.ts`

- [ ] **Step 1: Write a failing test**

```ts
expect(article).toContain("Shirow Masamune Artworks in the Shell");
expect(article).toContain("260+");
expect(article).toContain("theghostintheshell.jp/en/news/shirow_masamune_artworks");
```

- [ ] **Step 2: Run `bun test tests/shirow-artbook-feature.test.ts` and confirm failure**

- [ ] **Step 3: Leave the test uncommitted for the user.**

### Task 2: Archive the supplied art and publish the essay

**Files:**
- Create: `public/media/anime/shirow-masamune-artworks/*`
- Create: `src/content/artifacts/essays/shirow-masamune-artworks-in-the-shell.md`

- [ ] **Step 1: Copy supplied images using concise lowercase names.**
- [ ] **Step 2: Create published feature frontmatter with Anime and Games spheres, blue Motoko hero art, all gallery images, official source, and rights-reserved credits.**
- [ ] **Step 3: Write the article around the book’s full-career scope and verified physical details.**
- [ ] **Step 4: Run the focused test and confirm it passes.**

### Task 3: Validate static publishing

**Files:**
- Verify: `src/content/artifacts/essays/shirow-masamune-artworks-in-the-shell.md`

- [ ] **Step 1: Run `bun test`.**
- [ ] **Step 2: Run `bunx astro check`.**
- [ ] **Step 3: Run `bun run build` and confirm the new artifact route is generated.**
- [ ] **Step 4: Leave all changes for the user’s manual commit.**
