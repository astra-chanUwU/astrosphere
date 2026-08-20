# Bullying and Being Bullied Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the published manga series “Bullying and Being Bullied” with its supplied artwork and three available chapters.

**Architecture:** Extend the manga format schema with `web-comic`, store normalized WebP assets under `public/manga/bullying-and-being-bullied/`, and add one published series Markdown entry plus three published chapter Markdown entries. Existing manga routes and publishing guards will consume the records automatically.

**Tech Stack:** Astro 7, Astro content collections, Zod schemas, Markdown frontmatter, WebP image assets, Bun test runner.

## Global Constraints

- Use the slug `bullying-and-being-bullied` for the series and asset directory.
- Use internal creator metadata `{ name, slug }`, with creator slug `chida-daisuke`.
- Mark the series and all chapters `published`.
- Preserve the supplied synopsis and requested tags.
- Use WebP assets and zero-padded three-digit page filenames.
- Do not modify Git state; repository instructions require direct work on the main branch without Git commands unless explicitly requested.

### Task 1: Add schema coverage for the requested format

**Files:**
- Modify: `src/content.config.ts`
- Test: `tests/manga-schema.test.ts`

**Interfaces:**
- Produces a manga format schema that accepts `web-comic`.

- [ ] **Step 1: Write the failing test**

Add an assertion to the manga schema tests that the requested format is accepted by the schema’s format enum or by the parsed published fixture once it exists.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test tests/manga-schema.test.ts`
Expected: FAIL because `web-comic` is not currently in the allowed format values.

- [ ] **Step 3: Extend the format enum minimally**

Add `web-comic` to `mangaFormatSchema` in `src/content.config.ts` without changing other format behavior.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `bun test tests/manga-schema.test.ts`
Expected: PASS.

### Task 2: Normalize supplied manga assets

**Files:**
- Create: `public/manga/bullying-and-being-bullied/cover.webp`
- Create: `public/manga/bullying-and-being-bullied/art/1.webp`
- Create: `public/manga/bullying-and-being-bullied/chapter-001/001.webp` through `031.webp`
- Create: `public/manga/bullying-and-being-bullied/chapter-002/001.webp` through `021.webp`
- Create: `public/manga/bullying-and-being-bullied/chapter-003/001.webp` through `017.webp`

**Interfaces:**
- Supplies every local asset referenced by the published series and chapter frontmatter.

- [ ] **Step 1: Convert the supplied banner, art, and chapter PNGs to WebP**

Use `cwebp` with the source files in `/Users/astrochan/Downloads/bullying-and-being-bullied/`; map `banner.jpg` to `cover.webp`, `art/1.jpg` to `art/1.webp`, and preserve each chapter/page number.

- [ ] **Step 2: Verify the expected asset counts**

Run a file count for the three chapter directories and confirm counts of 31, 21, and 17, plus the cover and art file.

### Task 3: Add published series and chapter records

**Files:**
- Create: `src/content/manga/series/bullying-and-being-bullied.md`
- Create: `src/content/manga/chapters/bullying-and-being-bullied-chapter-001.md`
- Create: `src/content/manga/chapters/bullying-and-being-bullied-chapter-002.md`
- Create: `src/content/manga/chapters/bullying-and-being-bullied-chapter-003.md`

**Interfaces:**
- Exposes the series at `/manga/bullying-and-being-bullied`.
- Exposes chapters at `/manga/bullying-and-being-bullied/chapter-001`, `/chapter-002`, and `/chapter-003`.

- [ ] **Step 1: Create the series frontmatter**

Use title `Bullying and Being Bullied`, original title `Ijimete Ijirarete`, visibility `published`, status `ongoing`, publication year `2026`, rating `suggestive`, format `web-comic`, origin `original`, Chida Daisuke for both author and artist, and the requested tags and synopsis.

- [ ] **Step 2: Create chapter frontmatter for all supplied chapters**

Use chapter numbers 1–3, title `Chapter N`, published status, RTL reading direction, page paths matching the asset directories, PNG-derived WebP extension, and page dimensions read from the converted source images.

- [ ] **Step 3: Run the manga schema and route tests**

Run: `bun test tests/manga-schema.test.ts tests/manga-routes.test.ts tests/manga-creators-frontmatter.test.ts`
Expected: PASS with the new records included in the content graph.

### Task 4: Validate the production artifact

**Files:**
- Verify: `dist/`

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: PASS with zero failures.

- [ ] **Step 2: Run the production build**

Run: `bun run build`
Expected: Astro generates the new series and chapter routes, and Pagefind completes successfully.

- [ ] **Step 3: Verify published asset references**

Run the project’s publishing guard or equivalent focused checks and confirm there are no missing local assets or unpublished manga targets.
