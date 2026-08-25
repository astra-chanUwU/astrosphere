# Doujinshi Thumbnail Generation Design

**Date:** 2026-08-25
**Status:** Approved

## Purpose

Doujinshi overview previews currently load the same full reader images used by the reading stack. Long works therefore download unnecessarily large files for the compact page grid on the series page and the thumbnail rail inside the reader.

This feature adds managed WebP derivatives for doujinshi page previews. Full reader pages remain unchanged. Generated thumbnails stay beneath `MEDIA_ROOT/manga`, are synchronized with the rest of managed media, and are referenced only by the two doujinshi page-preview components.

## Goals

- Generate one compact WebP thumbnail for every available doujinshi reader page.
- Generate thumbnails automatically during new and replacement doujinshi imports.
- Backfill or repair existing doujinshi thumbnails through a focused media command.
- Keep generation incremental while providing an explicit forced-regeneration option.
- Store all derivatives outside the repository in the managed media tree.
- Preserve original reader images and their URLs.
- Make missing or invalid published thumbnails visible through `media:validate`.
- Leave manga, one-shots, artbooks, web comics, image sets, and archive cover cards unchanged.

## Non-goals

This version does not add:

- AVIF thumbnails or multiple thumbnail formats;
- responsive thumbnail size sets or `srcset` generation;
- runtime or on-request image generation;
- build-time mutation of `MEDIA_ROOT`;
- new thumbnail fields in manga series or chapter frontmatter;
- thumbnail use in the full reader stack, manga artwork, cover cards, Open Graph metadata, or image-set galleries;
- automatic fallback from a missing thumbnail to a full reader page.

## Storage and URL convention

Each thumbnail is colocated with its source chapter beneath a dedicated `thumbnails` directory. Page numbers retain the reader's three-digit naming convention.

```text
MEDIA_ROOT/manga/<series>/<chapter>/001.webp
MEDIA_ROOT/manga/<series>/<chapter>/thumbnails/001.webp
```

The corresponding public URLs are:

```text
/manga/<series>/<chapter>/001.webp
/manga/<series>/<chapter>/thumbnails/001.webp
```

Thumbnail URLs are derived from the existing chapter `pagePath` and page number. No derivative path is stored in content frontmatter. A shared URL helper owns this convention so components, reference collection, generation, and tests do not reproduce path-building logic.

The `thumbnails` directory remains inside the chapter directory so existing synchronization includes it automatically and existing chapter removal deletes it with the reader pages. Generated files must never be copied into `public/` or any other repository directory.

## Thumbnail profile

Every derivative uses one fixed profile:

- format: WebP;
- maximum width: 320 pixels;
- quality: 70;
- aspect ratio: preserved;
- enlargement: disabled;
- animation: not applicable because doujinshi reader pages are still WebP images;
- metadata: stripped unless required for correct rendering.

Portrait and landscape pages use the same maximum-width rule. A source narrower than 320 pixels is encoded without enlargement. Output verification requires readable WebP content, a positive width and height, and a width no greater than 320 pixels.

## Generation architecture

A focused media module owns thumbnail planning, freshness checks, rendering, output verification, and atomic publication. It accepts resolved reader-page inputs and produces deterministic thumbnail destinations and a concise result containing generated, skipped, and failed counts.

The generator must not scan arbitrary folders to decide which content is a doujinshi. Callers supply chapters already proven to belong to series whose `format` is `doujinshi`. This boundary keeps other manga formats out of scope and makes the generator independently testable.

For each page, a normal run generates a derivative when the destination is missing or older than its source. A destination that is at least as new as its source and passes lightweight WebP and dimension inspection is skipped. Forced mode regenerates every planned derivative regardless of freshness.

Each output is written to an operation-owned temporary sibling, verified, and renamed into its final path. Failure removes only temporary data owned by the operation and never leaves a partial destination file.

## Import integration

The reviewed batch doujinshi importer generates thumbnails after reader-page optimization and before staged media activation. It processes both new entries and replacement chapters.

Reader pages and their thumbnails are part of the same staged media tree. If extraction, reader optimization, thumbnail rendering, or thumbnail verification fails, the staged import fails and no incomplete replacement becomes active. Draft imports also generate thumbnails so their media is ready before publication.

Image-set imports and regular manga-volume imports do not invoke the thumbnail generator.

## Backfill and repair command

The public command is:

```text
bun run media:thumbnails [--series <slug>] [--dry-run] [--force]
```

With no series filter, the command discovers all available chapters belonging to doujinshi series. `--series` restricts work to one exact doujinshi slug and fails when the series does not exist or is not a doujinshi. `--dry-run` reports deterministic source-to-destination actions without writing files. `--force` regenerates every selected derivative.

The command validates arguments and `MEDIA_ROOT` before writing. It prints selected chapter and page totals followed by generated, skipped, and failed counts. Any page failure produces a nonzero media-processing exit and identifies the source page without continuing as if the operation fully succeeded.

The command is safe to rerun. Its default incremental behavior handles both initial backfill and later repair. `--force` is the recovery path when modification times cannot establish freshness.

## Preview rendering

Only these doujinshi preview surfaces change:

- `DoujinshiPagePreview.astro`, which renders the page grid on a doujinshi series page;
- the `page-preview` rail in `MangaReader.astro`.

Both use the shared thumbnail URL helper for their image `src`. Links still target the full reader page anchor. Existing page labels, alternative text, intrinsic dimensions, lazy loading, decoding behavior, layout, and keyboard navigation remain intact.

The full `page-stack` inside `MangaReader.astro` continues using `createMangaPageSrc`. `MangaSeriesCard.astro` continues loading the existing series cover. No runtime JavaScript substitutes full reader images when thumbnails are missing.

## Managed references and validation

Managed-media reference collection derives one thumbnail reference for every published, available chapter whose parent series has `format: doujinshi`. The collector must resolve the chapter-to-series relationship explicitly; filename conventions alone do not establish content format.

`media:validate` therefore treats every expected published doujinshi thumbnail as a managed reference. Existing validation detects missing, corrupt, or extension-mismatched files. Thumbnail-specific validation additionally rejects non-WebP content, nonpositive or unreadable dimensions, and widths greater than 320 pixels.

Unexpected files beneath a chapter's `thumbnails` directory remain ordinary managed-media orphans. Available published doujinshi require exactly one valid thumbnail per reader page. Unavailable chapters require no page or thumbnail references. Archived or draft content follows the validator's existing publication policy, while imports still generate derivatives for drafts.

Media synchronization remains unchanged: local validation runs before transfer, thumbnail files are included beneath `manga/`, and private `.astrosphere` data remains excluded.

## Failure behavior

- Missing or unreadable source pages stop generation with an actionable path.
- A rendering or verification failure cannot publish a partial thumbnail file.
- Batch-import thumbnail failure prevents activation of the entire staged entry.
- A backfill failure returns a nonzero exit and reports completed, skipped, and failed work accurately.
- An invalid `--series` value, repeated option, missing option value, or unexpected positional argument fails as a usage error before media mutation.
- Published missing or invalid thumbnails fail `media:validate`; the site does not silently load full reader images instead.
- Existing source reader pages are never modified or deleted by thumbnail generation.

## Backfill and release sequence

The first release follows this order:

1. Implement and verify generator, CLI, import, reference, validator, and component behavior.
2. Run `bun run media:thumbnails --dry-run` and review the planned library-wide derivative set.
3. Run `bun run media:thumbnails` to backfill local managed doujinshi media.
4. Run `bun run media:validate` and require zero errors and zero orphans.
5. Run one `bun run astro check`.
6. Synchronize managed media through the normal reviewed media-sync workflow before or alongside deploying markup that references thumbnail URLs.

This ordering prevents deployed preview markup from pointing at derivatives that have not reached the media origin.

## Verification

Focused automated coverage must prove:

- safe and zero-padded thumbnail URL derivation;
- rejection of paths outside `/manga/`;
- CLI defaults, series filtering, dry-run, force mode, and unsafe or ambiguous arguments;
- 320-pixel WebP output, quality configuration, aspect-ratio preservation, and no enlargement;
- incremental skipping of valid fresh files and regeneration of missing, stale, invalid, or forced files;
- atomic output publication and cleanup after rendering or verification failure;
- automatic staged generation for doujinshi create and replacement imports only;
- doujinshi-only thumbnail reference expansion and unavailable-chapter behavior;
- validation of missing, corrupt, wrong-format, oversized, and orphaned thumbnails;
- thumbnail URLs in both approved preview surfaces;
- unchanged full reader-page and archive-cover URLs.

After focused tests pass, the real backfill is verified once with `bun run media:validate` and one `bun run astro check`. Broad checks are not repeated against unchanged files.
