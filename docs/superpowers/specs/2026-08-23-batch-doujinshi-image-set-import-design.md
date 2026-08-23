# Batch Doujinshi and Image-Set Import Design

**Date:** 2026-08-23
**Status:** Approved

## Purpose

Extend the unified Bun/TypeScript media CLI so a reviewed manifest can safely turn a folder of ZIP/CBZ archives into complete doujinshi or image-set entries. The same workflow must also repair selected chapters of an existing entry without risking its other metadata or leaving broken references.

The supplied batch at `/Users/astrochan/Downloads/batch 1 doujinshi/` is the acceptance fixture. Its notes are metadata input only, never executable instructions.

## Scope

This change provides:

- `media:add batch` with YAML manifests and `--dry-run`;
- new single-chapter doujinshi creation;
- image-set creation;
- explicit, transactional replacement of selected existing chapters;
- concise draft content templates for essays, doujinshi, and image sets;
- documentation for the finished local and VPS-oriented workflow.

It does not introduce a CMS, database, browser admin panel, Git-based media storage, or automatic metadata scraping.

## Public workflow

Preview and publish a reviewed batch:

```text
bun run media:add batch "/absolute/source/folder" --manifest "/absolute/batch.yaml" --dry-run
bun run media:add batch "/absolute/source/folder" --manifest "/absolute/batch.yaml"
```

Publication is the default. `--draft` forces newly created entries to draft status; it does not change the visibility of an existing series during chapter replacement.

Create editable content-only templates:

```text
bun run content:new essay <slug>
bun run content:new doujinshi <slug>
bun run content:new image-set <slug>
```

Template commands refuse existing destinations, create schema-valid drafts, never copy media, and print the next applicable import command.

## Manifest contract

The manifest is versioned YAML parsed by the existing `yaml` dependency. It is the source of truth for archive selection, metadata, page splits, and replacement authorization.

```yaml
version: 1
defaults:
  ignoreEntries:
    - .DS_Store
    - ReadMe.txt
    - final.jpg
entries:
  - type: doujinshi
    archive: Example.zip
    mode: create
    series:
      slug: example
      title: Example
      originalTitle: Example
      aliases: []
      status: completed
      publicationYear: 2026
      description: Example description.
      rating: explicit
      origin: fanwork
      tags: []
      authors:
        - name: Example Circle
          slug: example-circle
      artists:
        - name: Example Artist
          slug: example-artist
      featured: false
    chapters:
      - number: 1
        title: Doujinshi
        pages: all

  - type: image-set
    archive: Gallery.zip
    mode: create
    imageSet:
      slug: example-gallery
      title: Example Gallery
      summary: Example summary.
      publishedAt: 2026-08-23
      rating: explicit
      tags: []
      spheres: []
      featured: false
```

Rules:

- `version` must be `1`.
- An archive is imported only when listed. Unlisted archives are reported and left untouched.
- `ignoreEntries` matches archive basenames. `final.jpg` is a batch choice, not a globally hardcoded rule.
- Reader pages are naturally sorted after ignored and unsupported entries are removed.
- A single chapter can use `pages: all`; split works use inclusive ordinal ranges such as `pages: { from: 1, to: 39 }`.
- New doujinshi always use the existing manga collection with `format: doujinshi`.
- Creator values use `{ name, slug }`; no external creator URLs are written.
- Existing content is never overwritten by `mode: create`.
- Existing chapter replacement requires `mode: update`, `replace: true`, the existing series slug, and explicit chapter definitions.
- Duplicate archives, overlapping page ranges, omitted accepted pages, slug collisions, invalid fields, and missing files fail preflight.

## Import behavior

### Preflight

Before any write, the importer validates the entire manifest, source folder, archive names, archive safety, supported image types, page selections, content schemas, destination policy, external media root, and required conversion tools. Dry-run stops after this stage and prints the planned creates, replacements, ignored files, unlisted archives, page counts, and destinations.

The source archives are always read-only.

### Doujinshi creation

For each new doujinshi, the importer:

1. Optimizes the selected reader images through the existing reader profile.
2. Writes numbered WebP pages under `MEDIA_ROOT/manga/<slug>/chapter-<number>/`.
3. Derives `MEDIA_ROOT/manga/<slug>/cover.webp` from the first page.
4. Creates the manga-series Markdown with `format: doujinshi` and root-relative cover URL.
5. Creates chapter Markdown containing the root-relative reader path, WebP extension, and verified page count.

The default single-chapter title is `Doujinshi` only when the manifest omits a title.

### Existing chapter replacement

Replacement changes only the chapters named by the manifest and their media directories. It preserves the existing series metadata, cover, art, visibility, and unrelated chapters.

New media and Markdown are fully staged and validated first. Existing chapter media and content are then moved into an operation-owned quarantine before the new files are activated. If activation or validation fails, the importer restores the prior chapters. Successful replacements retain the quarantined originals until the operation summary identifies their recoverable location.

### Image-set creation

For a new image set, the importer:

1. Optimizes every selected image through the gallery profile while preserving natural order.
2. Writes media below `MEDIA_ROOT/images/<slug>/`.
3. Uses the first optimized image as `hero` and the remaining images as `media`.
4. Creates `src/content/image-sets/<slug>.md` with root-relative `/media/images/...` URLs.

This represents every source image exactly once in the rendered gallery and obeys the project's hero/media deduplication rule.

### Transactions and reruns

Each entry is an independent transaction staged inside `MEDIA_ROOT/.astrosphere/imports/<operation-id>/` on the same filesystem as its final media. A failed entry leaves neither partial content nor partial published media. Earlier successful entries remain valid, and the final summary clearly separates succeeded, skipped, and failed entries.

A rerun never guesses. If an intended create already exists, it is reported and refused. If a previous completed entry is byte-for-byte and metadata-equivalent to the requested result, it is reported as already complete and skipped. Any mismatch requires an explicit update or replacement manifest.

## Supplied batch acceptance mapping

The supplied folder contains 17 archives. The import manifest will intentionally act on 16:

- replace the two broken chapters of `futanari-akuma-san-to-hiruyasumi`, using pages 1–39 for chapter 1 and pages 40–43 for chapter 2;
- create 14 new single-chapter doujinshi entries;
- create the final `[maiqo]` archive as one 448-image image set;
- leave `ai-to-bouryoku-to-skin-shin-teikoku-hen` and its archive untouched, as requested.

`Adventurers by Day, Freaky Friends by Night` is a new work, not an update to the existing `adventurers-by-day-secretly-training-by-night` entry.

The supplied `ReadMe.txt`, `final.jpg`, and `.DS_Store` files are ignored by this batch's manifest. The animated GIF in `Yuri Service` is retained as an animated WebP through the existing optimizer.

## Validation and reporting

Every activated entry must pass media output verification and content-schema validation. After the full batch, the command runs the equivalent of focused media validation for affected paths and reports:

- entries created, replaced, already complete, and failed;
- reader and gallery image counts;
- converted, copied, and ignored source counts;
- original and optimized byte totals;
- quarantine paths for recoverable replacements;
- the exact next command if site-wide validation is still required.

No success is reported for an entry until its content and external media agree.

## Code organization

The existing `scripts/media.ts` remains the public media entry point. Batch orchestration, manifest validation, archive inspection, content rendering, and transactional publication live in focused modules under `src/lib/media/`; existing optimizer and path logic are reused rather than duplicated.

`scripts/content.ts` becomes the small public entry point for `content:new`. Its template behavior lives in a focused content module and shares the actual collection schemas and conventions.

Automated tests cover manifest parsing, dry-run immutability, archive ordering and ignores, all/range selection, collision refusal, replacement rollback, rerun behavior, image-set hero deduplication, animated GIF routing, and content-template overwrite refusal. Final verification includes the media tests, `bun run media:validate`, `bun run astro check`, and a production build.

## Deployment fit

The importer writes Markdown to the application workspace and large binaries to `MEDIA_ROOT`. On a future VPS, the same command can run against the VPS checkout and media root, followed by a site build; alternatively, local content and media can be synchronized with the existing non-Git media workflow. Removing media later must use the existing unavailable/removal command so published Markdown never retains live references to deleted files.
