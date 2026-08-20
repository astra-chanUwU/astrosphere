# Illustrations of Paradise Lost by Gustave Doré Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone Astrolab essay presenting the complete supplied 1–50 Gustave Doré *Paradise Lost* plate sequence with sanitized, optimized web assets.

**Architecture:** Store processed WebP files in a dedicated `public/media/art/gustave-dore-paradise-lost/` directory. Add one published Markdown artifact using the existing `hero` and `media` frontmatter schema; plate 13 is the hero and is omitted from the gallery list because it is already represented as the banner. Plate 12 uses the supplied `1280px-Paradise_Lost_12.jpg` source.

**Tech Stack:** Astro content collections, Markdown frontmatter, `cwebp`, Astro build, TypeScript checks.

## Global Constraints

- Include every distinct numbered Doré plate 1–50 exactly once.
- Strip source metadata and emit optimized WebP derivatives at a maximum width of 1600px.
- Exclude non-Doré or duplicate supplied material: Dante, `Bildzitat.png`, `1920px-ParadiseSnarked.jpg`, the framed photograph, and alternate Satan crops.
- Do not create a trail in this pass.
- Do not modify Git state.

### Task 1: Process the canonical image set

**Files:**
- Create: `public/media/art/gustave-dore-paradise-lost/plate-01.webp` through `plate-50.webp`

- [ ] Convert `Paradise_Lost_1.jpg`–`Paradise_Lost_11.jpg` and `Paradise_Lost_13.jpg`–`Paradise_Lost_50.jpg`, plus `1280px-Paradise_Lost_12.jpg`, to WebP with `cwebp -resize 1600 0 -q 82 -metadata none`.
- [ ] Verify all 50 output files exist, decode successfully, and contain no EXIF metadata.

### Task 2: Add the standalone artifact

**Files:**
- Create: `src/content/artifacts/essays/illustrations-of-paradise-lost-by-gustave-dore.md`

- [ ] Add published essay frontmatter with slug, title, summary, art sphere, tags, hero, credits, notes, and 49 gallery entries.
- [ ] Use descriptive, scene-specific alt text and captions while avoiding unsupported plate-number/title claims.
- [ ] Include a concise introduction explaining that the gallery follows the supplied numbered sequence and that the images are presented for art discussion and study.

### Task 3: Validate the artifact and site

**Files:**
- Verify: generated WebP assets and new Markdown artifact

- [ ] Run Astro content/type checks.
- [ ] Run a production build and confirm the new route is generated.
- [ ] Check the final diff and confirm no unrelated files changed.
