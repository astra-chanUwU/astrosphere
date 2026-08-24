# Content and media operator guide

This is the practical human workflow for adding, editing, removing, checking, and publishing AstroSphere content. Heavy media stays outside Git in `MEDIA_ROOT`.

## Setup

Set the external library once in `.env`:

```dotenv
MEDIA_ROOT=/Users/astrochan/Documents/Workstation/astrosphere-media
```

The managed locations are:

```text
MEDIA_ROOT/manga/   manga and doujinshi pages
MEDIA_ROOT/images/  image-set and large editorial galleries
```

`MEDIA_ROOT/.astrosphere/` is private operation data. Never serve, synchronize, or edit it manually.

Astro serves the external media automatically during development:

```sh
astro dev --background
```

Use `astro dev status`, `astro dev logs`, and `astro dev stop` to manage it. You do not need `media:serve` while Astro is running.

## Choose the workflow

| Goal | Workflow |
| --- | --- |
| Write an essay | `content:new essay` |
| Add chapters to an existing manga or doujinshi | `media:add manga-volume` |
| Create a new doujinshi from an archive | reviewed `media:add batch` manifest |
| Create an image set from an archive | reviewed `media:add batch` manifest |
| Create metadata without media | `content:new doujinshi` or `content:new image-set` |
| Free one chapter's storage but keep its page | `media:remove ... --unavailable` |
| Convert a standalone folder/archive to WebP | `media:optimize` |
| Check all published media | `media:validate` |
| Upload media to the VPS | `media:sync` |

`media:maintain` is not a supported public command yet. Do not rely on unfinished internal maintenance modules.

## Essays

Create a safe draft:

```sh
bun run content:new essay <slug>
```

Edit `src/content/artifacts/essays/<slug>.md`. Keep `status: draft` until the writing and media are complete, then change it to `published`.

Large image collections belong under `MEDIA_ROOT/images/<slug>/` and use `/media/images/<slug>/...` URLs. Do not repeat the same image in `hero`, `media`, and the Markdown body.

Check the result:

```sh
bun run media:validate
bun run astro check
```

## Existing manga: add chapters or volumes

The series entry must already exist under `src/content/manga/series/`. Archive names must identify their chapter or volume number.

```sh
bun run media:add manga-volume <chapter-or-volume.cbz> --series <series-slug>
```

Pass several archives or a folder to import a batch:

```sh
bun run media:add manga-volume <source-1.cbz> <source-2.zip> --series <series-slug>
bun run media:add manga-volume <folder> --series <series-slug>
```

Imports publish by default. Add `--draft` when the generated chapters need review first. The importer preserves the source archives and writes optimized WebP pages to `MEDIA_ROOT/manga`.

## New doujinshi or image set

Use one versioned YAML manifest so metadata, page selection, and media are reviewed together. Start from [the working batch manifest](../media-manifests/2026-08-23-batch-1.yaml) or these minimal entries:

```yaml
version: 1
defaults:
  ignoreEntries: [.DS_Store]
entries:
  - type: doujinshi
    archive: Example.cbz
    mode: create
    series:
      slug: example
      title: Example
      originalTitle: Example
      aliases: []
      status: completed
      publicationYear: 2026
      description: A precise factual description.
      rating: explicit
      origin: original
      tags: []
      authors: [{ name: Example, slug: example }]
      artists: [{ name: Example, slug: example }]
      featured: false
    chapters:
      - { number: 1, title: Doujinshi, pages: all }

  - type: image-set
    archive: Gallery.zip
    mode: create
    imageSet:
      slug: example-gallery
      title: Example Gallery
      summary: A precise factual description.
      publishedAt: 2026-08-24
      rating: explicit
      tags: []
      spheres: []
      featured: false
```

Preview, correct every error, then apply the exact reviewed manifest:

```sh
bun run media:add batch <source-folder> --manifest <batch.yaml> --dry-run
bun run media:add batch <source-folder> --manifest <batch.yaml>
bun run media:validate
```

Do not create the destination with `content:new` before a `mode: create` batch import; create mode correctly refuses existing content. Existing doujinshi chapter replacement requires `mode: update`, `replace: true`, the existing series slug, and explicit chapter definitions.

## Content-only drafts

These commands create schema-shaped Markdown without copying media:

```sh
bun run content:new doujinshi <slug>
bun run content:new image-set <slug>
```

Use them when you want to write metadata first. For a new archive-backed entry, the batch importer is normally shorter because it creates both content and media.

## Removal

To free a manga/doujinshi chapter's media while preserving its published route and identity:

```sh
bun run media:remove manga <series-slug> --chapter <number> --unavailable
```

Review the preview and type `yes`. The chapter remains visible as “Currently unavailable.”

A complete entry deletion has no dedicated command. Do it only intentionally:

1. Find every content file and reference to the slug with `rg`.
2. Remove the exact series/image-set/essay content and any owned chapter files.
3. Permanently remove only that entry's uniquely owned directory beneath `MEDIA_ROOT/manga` or `MEDIA_ROOT/images`.
4. Do not delete shared media.
5. Run `bun run media:validate` and `bun run astro check`; finish only with zero errors and zero orphan warnings.

## Optimization and validation

Use the optimizer for a standalone source whose destination does not exist:

```sh
bun run media:optimize <source> --output <destination> --profile <reader|gallery> --dry-run
bun run media:optimize <source> --output <destination> --profile <reader|gallery>
```

JPEG and PNG become WebP; animated GIF becomes animated WebP. Existing WebP is copied without recompression.

For oversized managed manga, doujinshi, or image-set WebP files, use the tested web-reader profile. It caps portrait pages at 2400px wide and landscape pages at 4000px, skips smaller and animated WebP files, prepares and verifies the complete replacement, then asks once before changing the managed directory:

```sh
bun run media:optimize <managed-directory> --profile <reader|gallery> --web-reader --in-place
```

Always preview first. For a single manga chapter, use `reader`:

```sh
bun run media:optimize "$MEDIA_ROOT/manga/<series>/<chapter>" --profile reader --web-reader --in-place --dry-run
bun run media:optimize "$MEDIA_ROOT/manga/<series>/<chapter>" --profile reader --web-reader --in-place
```

For a complete manga or doujinshi containing several chapter folders, use `gallery` so every existing path and filename is preserved:

```sh
bun run media:optimize "$MEDIA_ROOT/manga/<series>" --profile gallery --web-reader --in-place --dry-run
bun run media:optimize "$MEDIA_ROOT/manga/<series>" --profile gallery --web-reader --in-place
```

For an image set, use the same whole-directory pattern under `MEDIA_ROOT/images/<slug>` with `--profile gallery`. The profile name controls output naming; it does not change the site's reader or gallery layout.

Before the real run, make sure the disk has room for a temporary optimized copy of the target. The command leaves the current directory active while it builds and verifies that copy. It then shows the original size, optimized size, and savings and waits for `yes`. If preparation, verification, or replacement fails, the existing managed directory is retained. Original torrent downloads and CBZ/ZIP archives elsewhere are not changed.

After replacement, check the complete library:

```sh
bun run media:validate
```

The result must have zero errors and zero orphans. Any remaining oversized warning includes an exact command for the affected directory. New manga-volume, doujinshi, and image-set imports already apply these web-reader limits at WebP quality 90 unless `--quality` is supplied, so this in-place workflow is mainly for older managed media.

Use the smallest relevant checks while working, then the complete publication checks once:

```sh
bun run media:validate
bun run astro check
bun run build
```

Media synchronization and VPS releases are separate. See [VPS deployment](./deployment-vps.md).
