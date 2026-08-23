# Unified Media CLI Design

**Date:** 2026-08-23
**Status:** Approved in conversation; awaiting written-spec review

## Purpose

Astrosphere currently treats manga reader files and image-set galleries as separate infrastructure. They use different environment variables, servers, synchronization scripts, validators, and command names. Doujinshi share the manga reader system but are a distinct content format. The current scripts also assume manually extracted reader directories and a Git-driven VPS deployment workflow that no longer matches the intended publishing model.

This change creates one media foundation for manga, doujinshi, and image sets. It unifies configuration and command naming, adds safe ZIP/CBZ and animated GIF optimization, separates fast media validation from full site builds, and establishes controlled media synchronization and pruning. Content-domain names and public URLs remain unchanged.

## Goals

- Use one external media root and one configuration vocabulary.
- Provide one dependency-free Bun/TypeScript CLI with focused subcommands.
- Serve all external media through shared, traversal-safe code during development.
- Optimize files, directories, ZIP archives, and CBZ archives without modifying their sources.
- Support still-image WebP conversion and animated GIF-to-WebP conversion.
- Validate published media references without requiring a full Astro build.
- Synchronize all external media without Git and without deleting remote files by default.
- Make remote deletion explicit, validated, reviewable, and confirmed.
- Remove obsolete scripts, package commands, environment variables, and misleading documentation.
- Preserve reusable behavior from the existing implementation in clearer media-focused modules.

## Non-goals

This phase does not implement:

- `media:optimize --in-place`;
- high-level `content:add`, `content:unavailable`, `content:restore`, or `content:publish` commands;
- website release upload, atomic site activation, or rollback;
- automated non-interactive pruning;
- animated AVIF output;
- hash-based media deduplication;
- a CMS or database-backed content model.

## Domain and storage model

Manga and doujinshi continue to use the existing manga content collection, reader pages, and `/manga/*` public URL namespace. Doujinshi remain distinguished through the manga `format` field; they do not become a separate storage or routing system.

Image-set galleries continue to use `/media/images/*` public URLs.

One external root contains both physical trees:

```text
MEDIA_ROOT=/absolute/path/to/astrosphere-media

MEDIA_ROOT/
├── manga/
└── images/
```

The URL-to-filesystem mapping is fixed:

```text
/manga/*        -> MEDIA_ROOT/manga/*
/media/images/* -> MEDIA_ROOT/images/*
```

The reserved `MEDIA_ROOT/.astrosphere/` directory holds local operation records such as prune manifests. It must never be served, synchronized, or reported as orphaned website media.

## Configuration

The active environment variables become:

```text
MEDIA_ROOT=/absolute/path/to/astrosphere-media
MEDIA_PORT=4322
MEDIA_SYNC_TARGET=user@host:/srv/astrosphere/media
```

`MEDIA_PORT` is optional and defaults to `4322`. `MEDIA_SYNC_TARGET` is required only for synchronization.

The implementation removes the old infrastructure variables rather than supporting aliases:

- `MANGA_MEDIA_ROOT`
- `IMAGE_SET_MEDIA_ROOT`
- `MANGA_MEDIA_PORT`
- `MANGA_VALIDATE_EXTERNAL`
- `IMAGE_SET_VALIDATE_EXTERNAL`
- `VPS_MEDIA_TARGET`
- `VPS_IMAGE_SET_TARGET`

Missing, relative, malformed, or unreadable configuration produces one actionable error before work begins.

## CLI architecture

The public CLI entry point is:

```text
scripts/media.ts
```

Package scripts expose the supported operations:

```text
bun run media:serve
bun run media:optimize
bun run media:validate
bun run media:sync
```

Each package script invokes the same entry point with a different subcommand. The entry point owns argument parsing, help text, concise user-facing output, and exit-code translation. It does not contain media-processing behavior.

Implementation behavior lives in focused modules under `src/lib/media/`:

- `config.ts` validates roots, ports, and synchronization targets.
- `paths.ts` maps public media URLs into allowed filesystem paths.
- `server.ts` provides framework-neutral resolution and response policy plus thin Astro and Bun adapters.
- `optimizer.ts` coordinates inspection, extraction, conversion, staging, naming, and output verification.
- `validator.ts` resolves content references and validates managed files.
- `sync.ts` builds and executes upload, comparison, manifest, and prune operations.
- `types.ts` contains shared option and result types only where they reduce duplication.

The CLI uses Bun and small TypeScript modules without adding a CLI framework.

## Media serving

Normal development remains a one-command workflow through `bun run dev`. Astro mounts a thin middleware adapter over the shared server core and serves both external URL namespaces from `MEDIA_ROOT`.

`bun run media:serve` starts a thin Bun adapter over the same server core as a standalone media-only server. It is intended for inspecting or testing media without running the site. It binds to `127.0.0.1` by default.

Both entry paths:

- accept only `GET` and `HEAD`;
- reject traversal, malformed encoding, and paths outside the two public media trees;
- never expose `.astrosphere` operation data;
- return useful `400`, `404`, and `405` responses;
- emit correct MIME types for supported website media, including GIF, WebP, and AVIF;
- use short development cache headers and development-safe CORS headers.

Production media serving remains the responsibility of Caddy or the eventual external media server. The Bun server is not a production origin design.

## Media optimization

The interface is:

```text
bun run media:optimize <source> --output <destination> --profile <reader|gallery>
```

Supported shared options are:

```text
--quality 85
--dry-run
```

Quality must be an integer from 1 through 100. Dry-run mode inspects the source and reports planned output without extracting, converting, creating staging data, or modifying the destination.

### Accepted sources

- one supported image file;
- a directory;
- a ZIP archive;
- a CBZ archive.

The optimizer detects actual file types instead of trusting filename extensions. Archive entries are checked before extraction so absolute paths, parent traversal, symlinks, and other escape mechanisms cannot write outside staging. Platform junk such as `.DS_Store`, `Thumbs.db`, and `__MACOSX` is ignored.

### Reader profile

The reader profile represents one chapter. It:

- requires one unambiguous set of page images;
- refuses nested structures that could represent multiple chapters instead of guessing;
- naturally sorts input pages;
- emits zero-padded `001.webp`, `002.webp`, and subsequent page names;
- preserves the complete page count and fails the operation if any page cannot be processed.

### Gallery profile

The gallery profile:

- preserves meaningful relative directories and base filenames;
- changes converted extensions to `.webp`;
- rejects output collisions, including differently formatted inputs that would map to the same WebP path;
- preserves the full accepted file set and fails rather than silently omitting a file.

### Format routing

- JPEG and PNG inputs are converted to WebP with `cwebp`.
- GIF inputs are converted with `gif2webp`; static GIFs become still WebP and animated GIFs retain animation timing, looping, and transparency.
- Existing WebP files are validated and copied unchanged.
- AVIF is supported by serving and validation but is not an optimizer input in this phase. The optimizer reports it as recognized but unsupported rather than converting or silently skipping it.
- Unknown, corrupt, or unsupported inputs fail the transaction with the offending path identified.

The optimizer checks required conversion tools before staging work. Output is built in a temporary sibling location, every resulting file is verified, and the completed staging tree is moved into place atomically. The source is never changed. An existing destination is refused. Any failure removes only temporary data owned by the current operation.

Successful output reports converted, copied, ignored-junk, and failed counts plus original and optimized byte totals. A successful transaction has zero failed files.

## Media validation

`bun run media:validate` is a focused media guard, not an alias for an Astro build.

It:

- validates `MEDIA_ROOT` before reading content;
- collects all published content capable of referencing external media;
- resolves manga, doujinshi, chapter, artifact, and image-set references;
- expands reader directories from chapter paths and page metadata;
- rejects paths outside the managed public media trees;
- checks referenced-file existence, expected format, and basic file integrity;
- reports unsupported, corrupt, malformed, and missing references as errors;
- scans managed media for files not referenced by published content;
- reports orphaned files as warnings rather than errors;
- excludes `.astrosphere` data from serving and orphan analysis;
- prints compact reference, file, error, and orphan totals.

An unavailable title may keep its public metadata page, title, description, and other non-media information. It must not retain live cover, gallery, or reader references to removed files. Any remaining missing reference is an error.

Optimization performs full output verification at creation time. Routine validation uses bounded header and metadata inspection so it remains substantially faster than a complete site build.

## Synchronization

The standard workflow is:

```text
bun run media:sync --dry-run
bun run media:sync
```

Standard synchronization:

- requires `MEDIA_ROOT` and `MEDIA_SYNC_TARGET`;
- validates local media before transfer;
- transfers both `manga/` and `images/` incrementally;
- uploads new and changed files;
- excludes `.astrosphere` operation records;
- never deletes remote files;
- does not pull Git, build the website, or activate a website release.

### Validated pruning

Remote deletion is available only through the explicit prune workflow:

```text
bun run media:sync --prune --dry-run
bun run media:sync --prune
```

Pruning performs these steps in order:

1. Validate local configuration and content references.
2. Compare the local managed trees with the remote target.
3. Build an exact deletion manifest containing only remote files absent locally.
4. Refuse the operation if published content references any deletion target.
5. Display the deletion count and total reclaimable bytes.
6. Save the manifest beneath `MEDIA_ROOT/.astrosphere/`.
7. Require interactive human confirmation.
8. Delete only files present in the reviewed manifest.
9. Retain the completed manifest as a local operation record.

An unreachable or changed remote target, a failed validation, a stale comparison, or declined confirmation results in no deletion. Version one provides no non-interactive confirmation bypass.

## Error and transaction model

All subcommands share these rules:

- validate arguments, configuration, roots, and external-tool availability before mutation;
- show concise actionable errors without raw stack traces by default;
- make `--dry-run` strictly read-only;
- avoid partial destination state;
- distinguish usage, configuration, validation, conversion, and synchronization failures with consistent nonzero exits;
- never modify real external media during automated tests.

Destructive behavior is restricted to confirmed synchronization pruning. Optimization is non-destructive in this phase.

## Existing-code disposition

The following scripts are removed after their replacements are verified:

- `scripts/sanitize-manga.ts`
- `scripts/serve-manga.ts`
- `scripts/validate-manga-media.ts`
- `scripts/sync-manga.ts`
- `scripts/sync-image-sets.ts`

Reusable behavior is migrated rather than duplicated:

- sanitizer sorting and numbering move into the optimizer;
- manga and image-set root resolution move into unified paths;
- server behavior moves into the shared media server;
- publishing-guard media checks move into the focused validator;
- synchronization command construction moves into the media sync module.

The following obsolete scripts and package commands are removed:

- `scripts/deploy-vps.ts` and `deploy:vps`, because Git pull plus VPS-side build contradicts the intended local-build/upload deployment model;
- `scripts/generate-bs2-batch.mjs`, because it is a completed hardcoded migration rather than reusable infrastructure.

Manga content, schemas, reader components, creator conventions, and `/manga/*` routes retain their domain-specific names.

## Documentation migration

Active documentation is updated to the unified vocabulary and workflow:

- `AGENTS.md`;
- `.env.example`;
- `README.md`;
- deployment and VPS guidance;
- relevant content guides.

`AGENTS.md` must state that:

- all heavy manga, doujinshi, and image-set files live beneath `MEDIA_ROOT`;
- manga and doujinshi share `MEDIA_ROOT/manga` and `/manga/*` URLs;
- image sets use `MEDIA_ROOT/images` and `/media/images/*` URLs;
- local development serves both namespaces through the shared media handler;
- media must not be copied into `public/` to repair local 404 responses;
- short GIF animations should be optimized to animated WebP while preserving their animation;
- `media:optimize`, `media:validate`, and dry-run-first synchronization are the supported operational commands.

Historical implementation plans and specifications remain historical records. Documents describing replaced workflows receive a clear superseded notice pointing to this specification instead of being silently rewritten as if they originally described the new system.

## Verification strategy

Automated tests cover:

- unified root configuration and public-path mapping;
- malformed paths, encoded traversal, and reserved-directory rejection;
- Astro middleware and standalone GET/HEAD serving behavior;
- MIME types for supported website formats;
- ZIP/CBZ extraction safety and junk filtering;
- reader sorting and zero-padded numbering;
- gallery path preservation and collision detection;
- still-image and GIF conversion routing;
- output verification and transactional failure cleanup;
- published, unavailable, missing, malformed, corrupt, and orphaned media cases;
- non-deleting synchronization;
- prune comparison, manifest retention, reference refusal, staleness checks, and confirmation;
- absence of obsolete command names and environment variables from active configuration and documentation.

Tests use temporary roots and fake process boundaries where appropriate. They do not connect to a real VPS or mutate the configured personal media collection.

Branch-level completion requires fresh successful runs of:

```text
bun test
bun run astro check
bun run build
```

Verification also exercises CLI help and dry-run paths plus a real sample optimization entirely inside a temporary directory.

## Future extensions

Later work may build on these library boundaries without replacing them:

- transactional `media:optimize --in-place` with backups, rollback, and post-conversion verification;
- `content:add` orchestration for manga, chapters, image sets, and essays;
- `content:unavailable` and `content:restore` state transitions;
- `content:publish` orchestration across optimization, validation, site checks, build, and deployment;
- local static-site build followed by atomic VPS upload, activation, retention, and rollback;
- explicitly authorized non-interactive pruning for automation;
- animated AVIF output after its tooling and delivery benefits justify the complexity;
- hash-based deduplication and storage accounting.
