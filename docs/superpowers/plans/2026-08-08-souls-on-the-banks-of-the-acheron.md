# Souls on the Banks of the Acheron Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a concise published Art-sphere essay for Adolf Hirémy-Hirschl’s *Souls on the Banks of the Acheron* with the supplied artwork as its hero image.

**Architecture:** Use the existing Astro content collection and artifact route. Add one public image asset and one Markdown artifact; no component or schema changes are needed.

**Tech Stack:** Astro, Astro Content Collections, Markdown, public raster media.

## Global Constraints

- Keep the essay short and observational rather than exhaustive.
- Use the existing `essay`, `feature`, and `hero` content patterns.
- Link factual artwork metadata to the Belvedere collection record.
- Do not modify Git state or create a commit.

---

### Task 1: Add the artwork asset

**Files:**
- Create: `public/media/art/adolf-hiremy-hirschl/souls-on-the-banks-of-the-acheron-1898.jpg`

- [ ] **Step 1: Copy the supplied source image into the project asset path**

```bash
mkdir -p public/media/art/adolf-hiremy-hirschl
cp "/Users/astrochan/Pictures/Art/Souls on the Banks of the Acheron | Adolf Hirémy-Hirschl | 1898.jpg" \
  public/media/art/adolf-hiremy-hirschl/souls-on-the-banks-of-the-acheron-1898.jpg
```

- [ ] **Step 2: Verify the asset exists and has image dimensions**

```bash
file public/media/art/adolf-hiremy-hirschl/souls-on-the-banks-of-the-acheron-1898.jpg
```

Expected: JPEG image with non-zero dimensions.

### Task 2: Add the concise art essay

**Files:**
- Create: `src/content/artifacts/essays/souls-on-the-banks-of-the-acheron.md`

- [ ] **Step 1: Add schema-valid frontmatter and short body copy**

Use slug `souls-on-the-banks-of-the-acheron`, type `essay`, status `published`, sphere `art`, layout `feature`, the new root-relative hero path, and source URL `https://sammlung.belvedere.at/objects/6707/die-seelen-am-acheron`.

- [ ] **Step 2: Keep the body to a brief orientation plus open-ended looking prompt**

Include the artist, 1898 date, oil-on-canvas medium, Belvedere location, Acheron myth, Hermes/Psychopompos reading, crowded figures, dark palette, and a closing invitation to observe without prescribing one final meaning.

### Task 3: Verify integration

**Files:**
- Verify: `src/content/artifacts/essays/souls-on-the-banks-of-the-acheron.md`
- Verify: `public/media/art/adolf-hiremy-hirschl/souls-on-the-banks-of-the-acheron-1898.jpg`

- [ ] **Step 1: Run the project build/check command**

```bash
npm run build
```

Expected: Astro completes successfully and generates the artifact route.

- [ ] **Step 2: Confirm the generated route and referenced image path**

```bash
test -f public/media/art/adolf-hiremy-hirschl/souls-on-the-banks-of-the-acheron-1898.jpg
test -d dist/artifacts/souls-on-the-banks-of-the-acheron
```

Expected: both commands exit successfully.
