# Anime Sphere Media Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert all raster images under `public/media/anime` to same-basename WebP assets, update Anime Sphere references, and remove exact duplicate hero images from article bodies.

**Architecture:** This is a content/assets migration with no renderer changes. A temporary-output conversion pass will create and validate WebP files before source replacement; a deterministic reference pass will update frontmatter and Markdown paths, and a targeted content pass will remove only first body images that equal their artifact hero.

**Tech Stack:** Bun, TypeScript scripts already present in the repository, `cwebp` for JPG/JPEG/PNG conversion, `ffmpeg` for the existing AVIF fallback, Astro content collections, Vitest.

## Global Constraints

- Included: raster files below `public/media/anime` and references to those files in Anime Sphere content.
- Excluded: `.mp3`, `.mp4`, `.DS_Store`, files outside `public/media/anime`, and non-duplicate body images.
- Keep original basenames and directories; change only image extensions to `.webp`.
- Preserve hero metadata for cards, social metadata, and the page-level hero.
- Remove only the first Markdown body image when it exactly matches the hero source.
- Validate each WebP before removing its source raster.

---

### Task 1: Inventory conversion inputs and duplicate body images

**Files:**
- Read: `public/media/anime/**/*`
- Read: `src/content/artifacts/essays/*.md`
- Read: `src/content/artifacts/notes/*.md`

**Interfaces:**
- Consumes: filesystem media paths and artifact frontmatter/body Markdown.
- Produces: a concrete conversion list, reference map, and duplicate-removal list for Tasks 2–4.

- [ ] **Step 1: Enumerate supported raster files and current WebP files**

Run:

```bash
find public/media/anime -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.avif' -o -iname '*.webp' \) -print | sort
```

Expected: all image inputs are below `public/media/anime`; audio/video files are absent from the conversion list.

- [ ] **Step 2: Identify exact hero/body duplicates**

For each Anime Sphere artifact, compare the `hero.src` value with the first Markdown image after the frontmatter. Record only exact path matches. Based on the current content, remove duplicate first body images from `go-ghost-king-gnu.md`, `strawberry-panic-old-yuri.md`, `urusei-yatsura-watch-guide.md`, `yani-neko-review.md`, and `shirow-masamune-artworks-in-the-shell.md` only when the first body image equals that file’s hero.

Expected: distinct first body images, including the Ghost in the Shell 2026 article’s first body image, remain untouched.

### Task 2: Convert Anime Sphere raster assets

**Files:**
- Modify: raster files under `public/media/anime`
- Create temporarily: sibling `.webp` conversion outputs, removed after source replacement

**Interfaces:**
- Consumes: the Task 1 raster inventory.
- Produces: one validated `.webp` per raster source, with no old raster source remaining.

- [ ] **Step 1: Convert JPG/JPEG/PNG files with `cwebp` at quality 85**

For each non-WebP JPG/JPEG/PNG source, write to a temporary `.webp.tmp` file with:

```bash
cwebp -quiet -q 85 "source.jpg" -o "source.webp.tmp"
```

Then validate the temporary file with:

```bash
file "source.webp.tmp"
```

Expected: `Web/P image` and exit status 0.

- [ ] **Step 2: Convert the AVIF source with the available media tool**

Convert `public/media/anime/urusei-yatsura/urusei-yatsura-2022-new.avif` to a temporary WebP using:

```bash
ffmpeg -y -i "public/media/anime/urusei-yatsura/urusei-yatsura-2022-new.avif" -c:v libwebp -q:v 50 "public/media/anime/urusei-yatsura/urusei-yatsura-2022-new.webp.tmp"
```

Validate it with `file` before replacement.

- [ ] **Step 3: Replace sources only after all outputs validate**

Rename each validated temporary file to its final `.webp` path, then remove only its corresponding `.jpg`, `.jpeg`, `.png`, or `.avif` source. Do not touch `.webp`, `.mp3`, `.mp4`, or `.DS_Store` files.

### Task 3: Update content references and remove duplicate body images

**Files:**
- Modify: Anime Sphere artifact Markdown files that reference converted assets

**Interfaces:**
- Consumes: the final source-to-WebP map from Task 2.
- Produces: content that references only existing WebP image paths and displays each hero once.

- [ ] **Step 1: Update all Anime Sphere image references**

Replace only image paths under `/media/anime/` whose extensions were converted. Keep alt text, credits, frontmatter structure, and non-Anime paths unchanged.

- [ ] **Step 2: Remove exact duplicate first body images**

Delete the first Markdown image line only when its path equals the artifact’s `hero.src`. Keep the `hero:` block and all later body/media images. Do not remove a first body image merely because it is visually similar.

- [ ] **Step 3: Search for stale references**

Run:

```bash
rg -n -i '/media/anime/[^ )]+\.(jpg|jpeg|png|avif)' src public --glob '!public/media/anime/**'
```

Expected: no stale Anime Sphere references remain outside the media directory.

### Task 4: Verify content, assets, and production build

**Files:**
- Read: final asset tree and content diff
- Test: existing repository test suite and production build

**Interfaces:**
- Consumes: Tasks 2–3 final files.
- Produces: fresh verification evidence for the completed migration.

- [ ] **Step 1: Confirm every raster source has a WebP replacement**

Run a script or shell loop over the pre-conversion inventory and verify each corresponding `.webp` exists and `file` identifies it as WebP.

- [ ] **Step 2: Confirm audio/video are unchanged**

Compare the `git diff --stat` and `git diff --name-only` output against the media inventory; only image files and intended Anime Sphere Markdown files may appear.

- [ ] **Step 3: Run tests**

Run:

```bash
bun test
```

Expected: exit code 0 with no failed tests.

- [ ] **Step 4: Run the production build**

Run:

```bash
bun run build
```

Expected: exit code 0 and generated pages resolve the updated WebP references.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors, no stale source image references, and no unrelated changes.
