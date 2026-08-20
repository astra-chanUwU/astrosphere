# Iran Sphere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish an Iran sphere and its first Pahlavi-era archival essay.

**Architecture:** A sphere supplies the discovery route and visual accent; one feature artifact supplies the essay and references the local media archive. Existing Astro content schemas and publishing guardrails require no code changes.

**Tech Stack:** Astro content collections, Markdown, Bun.

---

### Task 1: Add the Iran sphere

**Files:**
- Create: `src/content/spheres/iran.md`

- [ ] Create a published `iran` sphere with the ember palette, a Persian/Pahlavi-focused summary, and a locally hosted Mohammad Reza Pahlavi portrait as its cover.

### Task 2: Add the first archival essay and media

**Files:**
- Create: `public/media/history/iran/mossadegh-myth/*`
- Create: `src/content/artifacts/essays/the-mossadegh-myth.md`

- [ ] Copy supplied images to the local Iran archive folder and normalize names to lowercase hyphenated URLs.
- [ ] Create a published feature essay in the `iran` sphere with the supplied thread as source material, a hero image, and an image placed with every relevant section.

### Task 3: Verify the archive entry

**Files:**
- Verify: `src/content/spheres/iran.md`
- Verify: `src/content/artifacts/essays/the-mossadegh-myth.md`

- [ ] Run `bun test` and expect all tests to pass.
- [ ] Run `bunx astro check` and expect no diagnostics.
- [ ] Run `bun run build` and expect the publishing guard and Pagefind indexing to complete.
