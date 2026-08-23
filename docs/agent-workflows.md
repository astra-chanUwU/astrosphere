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
