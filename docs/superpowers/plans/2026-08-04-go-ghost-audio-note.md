# GO GHOST Audio Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a local-audio Ghost in the Shell note with official release links.

**Architecture:** A Markdown artifact declares image and audio frontmatter media. The existing `MediaFrame` component renders the audio with native browser controls, while Astro's publishing guard verifies all local asset paths.

**Tech Stack:** Astro content collections, Markdown, Bun tests, static public media.

## Global Constraints

- Keep all supplied assets below `public/media/anime/go-ghost/`.
- Use only the official announcement, video, and streaming URLs supplied by the user.
- Preserve the user's manual-commit workflow; do not commit or push.

---

### Task 1: Define the published-entry contract

**Files:**
- Create: `tests/go-ghost-feature.test.ts`

- [ ] **Step 1: Write a failing test** asserting the artifact declares Anime, local MP3 media, and the official YouTube URL.
- [ ] **Step 2: Run** `bun test tests/go-ghost-feature.test.ts` **and confirm the expected missing-artifact failure.**

### Task 2: Publish the audio note

**Files:**
- Create: `public/media/anime/go-ghost/go-ghost.mp3`
- Create: `public/media/anime/go-ghost/go-ghost-banner.png`
- Create: `public/media/anime/go-ghost/go-ghost-cover.jpg`
- Create: `src/content/artifacts/notes/go-ghost-king-gnu.md`

- [ ] **Step 1: Copy and normalize the supplied media names.**
- [ ] **Step 2: Add a published `note` artifact with the banner hero, cover and audio media entries, credits, and official URLs.**
- [ ] **Step 3: Run the focused feature test and confirm it passes.**

### Task 3: Verify the archive build

**Files:**
- Verify: `src/content/artifacts/notes/go-ghost-king-gnu.md`

- [ ] **Step 1: Run** `bun test`.
- [ ] **Step 2: Run** `bunx astro check`.
- [ ] **Step 3: Run** `bun run build` **and confirm the artifact route is emitted.**
