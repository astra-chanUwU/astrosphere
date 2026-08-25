# Efficient agent workflows

This is the execution guide for coding agents handling routine AstroSphere content and media requests. Prefer the shortest existing command over custom scripts, broad redesign, or delegation.

## Operating rules

- Work directly on `main`; do not run Git unless the user explicitly asks.
- Do routine work yourself. Do not create subagents, branches, plans, or architecture documents unless the user asks.
- Inspect with `rg` first. Read only the relevant entry, schema/example, and source material.
- Heavy manga/doujinshi/image-set files stay outside the repository in `MEDIA_ROOT`.
- Never copy managed media into `public/` to fix a local 404.
- Never edit or expose `MEDIA_ROOT/.astrosphere/`.
- `media:maintain` is unfinished and not a supported command.
- Do not invent metadata. Ask only for missing source material or a choice that changes the published result.
- Run focused checks during work and one final validation pass. Do not repeatedly run the whole suite for content-only changes.

## Decide immediately

| User request | Use |
| --- | --- |
| “Write/add an essay” | `bun run content:new essay <slug>` |
| “Add these CBZ/ZIP volumes to this existing manga” | `bun run media:add manga-volume ... --series <slug>` |
| “Create this doujinshi from an archive” | `media:add batch` with a reviewed manifest |
| “Create this image set from an archive” | `media:add batch` with a reviewed manifest |
| “Create metadata now; media later” | `content:new doujinshi` or `content:new image-set` |
| “Remove this chapter but keep the page” | `media:remove manga ... --unavailable` |
| “Delete this entry completely” | exact content/reference audit, exact owned deletion, validate |
| “Optimize this image/archive/folder” | `media:optimize` |
| “Generate or repair manga/doujinshi preview thumbnails” | `media:thumbnails` |
| “Publish/upload media” | validate, sync dry-run, sync |

## Add an essay

Minimum input: topic/content, desired slug or enough information to derive one, and any supplied sources/media.

```sh
bun run content:new essay <slug>
```

Then:

1. Edit only `src/content/artifacts/essays/<slug>.md` and explicitly supplied related entries.
2. Replace template prose and placeholder summary.
3. Put large galleries in `MEDIA_ROOT/images/<slug>/`; use `/media/images/<slug>/...` references.
4. Keep `status: draft` if facts, sources, media, alt text, or credits are incomplete.
5. Avoid hero/gallery/body duplication.
6. Run `bun run media:validate` when managed images are used, then `bun run astro check`.

Do not turn a simple writing task into a component or schema change.

## Add chapters to an existing manga or doujinshi

For an already-managed oversized volume that must be divided into story chapters, follow [Splitting a large manga volume into chapters](./manga-chapter-splitting.md). Do not use equal page ranges or infer boundaries from printed page numbers alone.

Confirm the series exists:

```sh
rg -n '^slug: <series-slug>$' src/content/manga/series
```

Import all supplied chapter-labelled archives in one command:

```sh
bun run media:add manga-volume <source...> --series <series-slug>
```

Use `--draft` only when review was requested. After import:

```sh
bun run media:validate
bun run astro check
```

Do not unpack archives manually, rename generated pages, or write chapter Markdown by hand when this importer fits.

If the series does not exist, obtain or derive its factual metadata first. For a doujinshi, prefer batch create. For a regular manga, create the series entry from the nearest valid manga-series example, keep it draft until metadata is complete, then run the volume importer.

## Add a doujinshi or image set from archives

Minimum input: source folder/archive, title/slug, creator credits, rating, origin, publication date/year when known, and tags/spheres if supplied.

1. Copy the smallest matching entry from `media-manifests/2026-08-23-batch-1.yaml` into a new versioned manifest.
2. List only intended archives. Put junk basenames in `defaults.ignoreEntries`.
3. Use `mode: create` for a new destination.
4. Use `mode: update` plus `replace: true` only when the user explicitly requested replacement.
5. Preview once:

```sh
bun run media:add batch <folder> --manifest <manifest.yaml> --dry-run
```

6. Fix all reported problems together, rerun the dry-run if the manifest changed materially, then apply once:

```sh
bun run media:add batch <folder> --manifest <manifest.yaml>
bun run media:validate
bun run astro check
```

Do not pre-create a `mode: create` destination with `content:new`. Do not weaken collision, page-range, archive-safety, or replacement checks.

### Manual metadata correction for imported entries

When a user supplies authoritative metadata for an imported manga or doujinshi:

1. Update the series frontmatter with the supplied title, format, origin, tags, authors, and artists. Map source Groups to `authors`; map source Artists to `artists`.
2. Update the corresponding chapter frontmatter `title` from the generic `Doujinshi` placeholder to the entry’s actual title, quoting YAML titles that contain `:` or other YAML-sensitive punctuation.
3. Replace the chapter body placeholder with a short entry-specific description or page-count sentence; do not leave `Draft import. Verify metadata before publishing.` in a reviewed entry.
4. Keep the chapter’s existing page count and media paths unless the user explicitly requests a media replacement.
5. Run `bun run astro check` once after the batch of metadata corrections.

This chapter-title update is required for every metadata correction, including batch corrections, so published entries do not display “Doujinshi — Doujinshi.”

## Remove content

### Keep the chapter route

```sh
bun run media:remove manga <series-slug> --chapter <number> --unavailable
```

Review the exact preview and confirm. This is the default when the user is temporarily short on storage.

### Permanently delete a complete entry

Only do this when the user explicitly requests permanent deletion.

1. Resolve the exact content files, managed URLs, and external directory.
2. Search the repository for the slug and remove/update incoming relations, trails, or links deliberately.
3. Remove only the entry's content files and uniquely owned external media directory.
4. Never use an unresolved variable, broad glob, repository root, `MEDIA_ROOT`, or managed namespace root as a deletion target.
5. Run:

```sh
bun run media:validate
bun run astro check
```

Zero errors and zero orphan warnings are required. Report exactly what was permanently removed.

For a single chapter that should remain visible, use the unavailable command instead.

## Optimize media

Preview and then apply to a destination that does not exist:

```sh
bun run media:optimize <source> --output <destination> --profile <reader|gallery> --dry-run
bun run media:optimize <source> --output <destination> --profile <reader|gallery>
```

Use `reader` for ordered pages and `gallery` for filename-preserving galleries. Do not recompress an already managed WebP library without an explicit request.

### Generate manga, doujinshi, and image-set preview thumbnails

Preview and generate the complete managed preview-thumbnail set:

```sh
bun run media:thumbnails --dry-run
bun run media:thumbnails
```

Restrict repair to one doujinshi, or force regeneration when timestamps cannot establish freshness:

```sh
bun run media:thumbnails --series <slug>
bun run media:thumbnails --series <slug> --force
```

This command writes 320px WebP derivatives for manga and doujinshi covers, compact artwork previews, available reader pages, image-set covers, and image-set gallery tiles. Manga derivatives live beneath reserved `thumbnails/` directories in `MEDIA_ROOT/manga/<series>/`; image-set derivatives live in `MEDIA_ROOT/images/<slug>/thumbnails/`. Generated media is never copied into the repository. Full artwork galleries, reader pages, and image-set links continue to use original media. Run `bun run media:validate` before synchronization.

### Resize oversized managed media for the web reader

Use this only when the user explicitly authorizes changing the managed files in `MEDIA_ROOT`. The web-reader mode preserves filenames and nested paths, resizes portrait pages wider than 2400px and landscape pages wider than 4000px with Lanczos resampling, and encodes resized pages as WebP at quality 90 by default. Smaller pages and animated WebP files are copied unchanged.

For one chapter or another single ordered reader directory, use `reader`:

```sh
bun run media:optimize "$MEDIA_ROOT/manga/<series>/<chapter>" --profile reader --web-reader --in-place --dry-run
bun run media:optimize "$MEDIA_ROOT/manga/<series>/<chapter>" --profile reader --web-reader --in-place
```

For an entire manga/doujinshi with several chapter directories, or for an image set whose nested paths and filenames must remain unchanged, use `gallery`:

```sh
bun run media:optimize "$MEDIA_ROOT/manga/<series>" --profile gallery --web-reader --in-place --dry-run
bun run media:optimize "$MEDIA_ROOT/manga/<series>" --profile gallery --web-reader --in-place
```

`gallery` is required for a whole series because it preserves every chapter path; it does not change how the images are displayed on the website.

Agent checklist:

1. Resolve and inspect the exact target. Never aim at `MEDIA_ROOT`, `MEDIA_ROOT/manga`, or `MEDIA_ROOT/images` as a whole.
2. Check available disk space. In-place mode first builds and verifies a sibling replacement, so the volume must temporarily fit the optimized copy as well as the source.
3. Run the dry-run and report the planned, resized, and unchanged counts. Stop on unsupported files or an unexpected target.
4. Run the same command without `--dry-run`. Read the prepared size summary and type `yes` only when it matches the authorized target.
5. Run `bun run media:validate`. Finish only with zero errors and zero orphans, and confirm the target no longer appears in oversized warnings.

The transaction replaces the website's managed directory only after every output has been prepared and verified. It does not change original CBZ/ZIP downloads. Do not bypass a refusal, manually delete a staging directory while the command is running, synchronize media, deploy, commit, or push unless the user separately requests it.

## Split managed manga volumes into reader chapters

Use this workflow when a managed manga series is stored as whole-volume page sets but the reader should expose individual chapters.

- Confirm the target series and exact managed media root. Keep the work scoped to that manga; do not modify the optimizer or other series.
- Research the volume-to-chapter mapping from an authoritative source, but use local contents pages and chapter title pages to determine image offsets. Do not divide page counts evenly.
- Build a boundary table for every volume. The first chapter includes front matter before the first printed chapter, and the final chapter includes trailing bonus or special pages unless the source clearly identifies a separate entry.
- Rebuild into a temporary directory outside the managed namespace. Copy and locally renumber pages, preserving original bytes and reader orientation. Verify every copied page with SHA-256 checksums before switching directories.
- Update content entries and canonical routes together. If existing chapter entries occupy temporary route numbers, move those media directories to their real chapter numbers before installing rebuilt chapters; avoid collisions with a temporary holding name.
- Move old volume directories to an exact, series-specific rollback backup. Do not delete them until the rebuilt set passes validation.
- Run `bun run media:validate` and `bun run astro check`. Confirm zero validation errors and that the target series has no missing or orphaned pages; distinguish pre-existing unrelated repository warnings from issues introduced by the split.

For reference, Witch Hat Atelier volume 1 mapped to chapters 1–5 with local starts at pages `1, 67, 105, 137, 173` in a 211-page set. The same evidence-first boundary method was used for all fourteen volumes. Useful research starting points are the [publisher's series page](https://kodansha.us/series/witch-hat-atelier/) and the [chapter list](https://en.wikipedia.org/wiki/List_of_Witch_Hat_Atelier_chapters).

## Publish media to the VPS

```sh
bun run media:validate
bun run media:sync -- --dry-run
bun run media:sync
```

Standard sync never deletes remote files. Remote prune is a separate explicit request:

```sh
bun run media:sync -- --dry-run --prune
bun run media:sync -- --prune
```

Never infer permission to deploy the website, prune remote files, commit, or push from a content/import request.

## Efficient handoff

Return only:

- what was created, updated, marked unavailable, or permanently deleted;
- the content URL/slug;
- imported chapter/image counts when relevant;
- checks run and their result;
- one real blocker or remaining draft field, if any.

Do not return a transcript of commands or a long explanation of internal implementation.
