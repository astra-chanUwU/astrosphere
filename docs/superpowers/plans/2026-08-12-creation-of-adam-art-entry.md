# The Creation of Adam Art Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a researched, image-rich Artsphere artifact about Michelangelo’s *The Creation of Adam* using the existing artifact collection and media gallery.

**Architecture:** Add one Markdown artifact under `src/content/artifacts/essays/` with a full-composition hero and supporting images in `media`. Copy the user-provided source images into `public/media/art/michelangelo/` and reference them with root-relative URLs so the publishing guard can validate every asset.

**Tech Stack:** Astro 7, Astro content collections, Markdown frontmatter, static public assets, Bun/npm build scripts.

## Global Constraints

- Work directly on the main branch; do not modify Git state unless explicitly requested.
- Use the existing `art` sphere and artifact schema.
- Use root-relative public media paths for local images.
- Keep the essay original, concise, and grounded in the Vatican Museums and British Museum references.

---

### Task 1: Prepare Michelangelo media assets

**Files:**
- Create: `public/media/art/michelangelo/creation-of-adam-full.jpg`
- Create: `public/media/art/michelangelo/creation-of-adam-context.jpg`
- Create: `public/media/art/michelangelo/creation-of-adam-detail-hands.jpg`
- Create: `public/media/art/michelangelo/creation-of-adam-detail-god.jpg`
- Create: `public/media/art/michelangelo/creation-of-adam-detail-adam.jpg`
- Create: `public/media/art/michelangelo/adam-study.jpg`
- Create: `public/media/art/michelangelo/sistine-ceiling.jpg`
- Create: `public/media/art/michelangelo/vault-study-arms-hands.jpg`

- [ ] Copy the eight user-provided JPGs into the named public paths, using the full composition as the hero source.
- [ ] Verify each copied file exists and has non-zero size.

### Task 2: Publish the essay artifact

**Files:**
- Create: `src/content/artifacts/essays/the-creation-of-adam-michelangelo.md`

- [ ] Add valid frontmatter: slug, title, essay type, published status, 2026-08-12 date, `art` sphere, Michelangelo tags, feature layout, author, location, source URL, credits, and notes.
- [ ] Set `/media/art/michelangelo/creation-of-adam-full.jpg` as the hero.
- [ ] Add seven supporting media items with meaningful alt text, captions, and source-specific credits.
- [ ] Write an original essay covering the suspended gesture, the active/passive contrast between God and Adam, bodily idealization, the preparatory drawings, the ceiling context, and the work’s continuing visual afterlife.

### Task 3: Verify publication

**Files:**
- Verify: `src/content/artifacts/essays/the-creation-of-adam-michelangelo.md`
- Verify: `public/media/art/michelangelo/`

- [ ] Run `bun run build` from the repository root.
- [ ] Confirm the build exits successfully and the generated route includes `dist/artifacts/the-creation-of-adam-michelangelo/index.html`.
- [ ] Confirm all eight image paths are present in the generated `dist/media/art/michelangelo/` directory.
