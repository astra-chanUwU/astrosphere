# Mephisto Art Essay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Eduard von Grützner's *Mephisto* (1895) as a fuller Art-sphere essay with a five-image Faust/Mephisto gallery.

**Architecture:** Use the existing `artifacts` content collection and `feature` layout. Copy the five supplied images into one normalized public-media directory; use the Grützner image as `hero` and the other four images as `media` on the same artifact page.

**Tech Stack:** Astro, Astro Content Collections, Markdown frontmatter, static assets in `public/`, Bun scripts.

## Global Constraints

- Use root-relative media paths beginning with `/media/`.
- Use lowercase, hyphenated asset filenames.
- Keep the entry in the published `art` sphere.
- Do not invent collection or provenance details that are not established by the supplied files.
- Keep unrelated existing worktree changes untouched.

---

### Task 1: Add normalized artwork assets

**Files:**
- Create: `public/media/art/mephisto/eduard-von-grutzner-mephisto-1895.png`
- Create: `public/media/art/mephisto/ary-scheffer-faust-and-marguerite.jpeg`
- Create: `public/media/art/mephisto/max-klinger-intermezzi-faust-print.jpg`
- Create: `public/media/art/mephisto/harry-clarke-goethes-faust-illustration.jpg`
- Create: `public/media/art/mephisto/eugene-delacroix-faust-and-mephistopheles-flying.jpg`

**Interfaces:**
- Produces five public assets referenced by the artifact in Task 2.

- [ ] **Step 1: Create the destination directory.**

Run:

```bash
mkdir -p public/media/art/mephisto
```

- [ ] **Step 2: Copy each supplied image using the normalized filename.**

Run:

```bash
cp "/Users/astrochan/Pictures/Art/Mephisto | Eduard von Grutzner | 1895.png" public/media/art/mephisto/eduard-von-grutzner-mephisto-1895.png
cp "/Users/astrochan/Downloads/Ary Scheffer’s Faust and Marguerite paintings.jpeg" public/media/art/mephisto/ary-scheffer-faust-and-marguerite.jpeg
cp "/Users/astrochan/Downloads/Max Klinger’s Intermezzi : Faust-related prints.jpg" public/media/art/mephisto/max-klinger-intermezzi-faust-print.jpg
cp "/Users/astrochan/Downloads/Harry Clarke’s illustrations for Goethe’s Faust.jpg" public/media/art/mephisto/harry-clarke-goethes-faust-illustration.jpg
cp "/Users/astrochan/Downloads/Eugène Delacroix’s Faust and Mephistopheles Flying over the Landscape and his other Faust lithographs.jpg" public/media/art/mephisto/eugene-delacroix-faust-and-mephistopheles-flying.jpg
```

- [ ] **Step 3: Verify all five files exist and identify their dimensions.**

Run:

```bash
file public/media/art/mephisto/*
```

Expected: five image files with readable image types and dimensions.

### Task 2: Add the published essay artifact

**Files:**
- Create: `src/content/artifacts/essays/mephisto-eduard-von-grutzner-1895.md`

**Interfaces:**
- Consumes the five public asset paths from Task 1.
- Produces a published artifact at `/artifacts/mephisto-eduard-von-grutzner-1895`.

- [ ] **Step 1: Add valid frontmatter for the existing artifact schema.**

Use `type: essay`, `status: published`, `layout: feature`, `spheres: [art]`, the seven approved tags, Grützner as author, and the normalized Grützner image as `hero`.

- [ ] **Step 2: Add the four companion images to `media`.**

Each image must include a descriptive `alt`, a concise `caption`, and a credit that identifies the supplied image without claiming an unverified collection or provenance.

- [ ] **Step 3: Write the fuller historical essay body.**

Cover Grützner's Munich context and recurring interest in literary/theatrical subjects; explain the long afterlife of Goethe's *Faust*; closely read the red costume, feathered cap, direct gaze, forward lean, and sword; then compare the five images as different transformations of Mephisto and the Faust legend.

- [ ] **Step 4: Validate the Markdown frontmatter locally.**

Run:

```bash
bun run astro check
```

Expected: the new entry parses without schema or TypeScript errors.

### Task 3: Build and preview the published route

**Files:**
- Modify: generated build output only; do not add generated files to source control.

**Interfaces:**
- Consumes the new artifact and five public assets.
- Produces a verified static route and searchable media references.

- [ ] **Step 1: Run the production build.**

Run:

```bash
bun run build
```

Expected: Astro completes the build, the publishing guard accepts all references, and Pagefind completes.

- [ ] **Step 2: Confirm the generated route and asset references.**

Run:

```bash
test -f dist/artifacts/mephisto-eduard-von-grutzner-1895/index.html
rg -n "eduard-von-grutzner-mephisto-1895|ary-scheffer-faust-and-marguerite|max-klinger-intermezzi-faust-print|harry-clarke-goethes-faust-illustration|eugene-delacroix-faust-and-mephistopheles-flying" dist/artifacts/mephisto-eduard-von-grutzner-1895/index.html
```

Expected: the route exists and all five normalized paths appear in the generated HTML.

- [ ] **Step 3: Start the project preview server in background mode.**

Run:

```bash
astro dev --background
```

Then inspect with `astro dev status` and report the route for review.
