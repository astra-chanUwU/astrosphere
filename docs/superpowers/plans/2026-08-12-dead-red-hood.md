# Dead Red Hood Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first published DEAD RED HOOD artifact, its seven supplied images, and a trail ready for later BLACKSOULS-related posts.

**Architecture:** Follow the existing Astro content collections. Store the article in `src/content/artifacts/essays/`, copy supplied media into a game-specific public directory, and define a one-item published trail in `src/content/trails/`.

**Tech Stack:** Astro content collections, Markdown frontmatter, static assets in `public/`, Astro build and publishing guardrails.

## Global Constraints

- Use the existing `games` sphere and `feature` artifact layout.
- Mark the article as adult/NSFW and spoiler-sensitive in visible copy.
- Keep external links limited to the supplied DLsite, Steam, and FGGUIDES sources.
- Use descriptive alt text and critical-commentary credits for supplied artwork.
- Do not modify Git state; the repository instructions reserve Git operations for explicit user requests.

### Task 1: Add artwork assets

**Files:**
- Create: `public/media/games/dead-red-hood/`
- Source: `/Users/astrochan/Downloads/DRH-and-Poro-in-Agartha.jpg`, `/Users/astrochan/Downloads/A-red-hood-backalley.jpg`, `/Users/astrochan/Downloads/A-shark-in-DRH.jpg`, `/Users/astrochan/Downloads/A-strange-thing-DRH.jpg`, `/Users/astrochan/Downloads/Agartha.jpg`, `/Users/astrochan/Downloads/Red-Hood-in-the-city.jpg`, `/Users/astrochan/Downloads/Black-Trial-in-DRH.jpg`

- [x] Copy the seven supplied images into the game-specific public media directory with stable lowercase filenames.
- [x] Verify all seven files exist and preserve readable image dimensions.

### Task 2: Add the published artifact

**Files:**
- Create: `src/content/artifacts/essays/dead-red-hood.md`

- [x] Add valid artifact frontmatter with slug `dead-red-hood`, type `essay`, status `published`, the `games` sphere, feature layout, hero media, six gallery media entries, source URL, credits, and a rights note.
- [x] Write the first post with the adult/NSFW and spoiler warnings, premise, development status, steampunk stealth gameplay, Black Trial explanation, BLACKSOULS continuity, and source links.
- [x] Use Markdown image references only to the copied public assets.

### Task 3: Start the trail

**Files:**
- Create: `src/content/trails/dead-red-hood-thread.md`

- [x] Add a published trail named “Dead Red Hood Thread” with `dead-red-hood` as its first and currently only artifact item.
- [x] Make the trail summary state that later BLACKSOULS entries can extend the route without implying they already exist.

### Task 4: Verify

**Files:**
- Verify: `src/content/artifacts/essays/dead-red-hood.md`
- Verify: `src/content/trails/dead-red-hood-thread.md`
- Verify: `public/media/games/dead-red-hood/*`

- [x] Run the full Astro build, including Pagefind generation.
- [x] Confirm the build exits successfully and does not report missing content references or media assets.
