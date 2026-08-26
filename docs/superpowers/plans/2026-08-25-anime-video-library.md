# Anime Video Library Implementation Plan

> **For agentic workers:** Execute this plan with one agent directly in the current workspace. Do not delegate, create a branch/worktree, run Git, synchronize media, deploy, prune, or delete source files unless the user explicitly requests it. Use strict test-first development for behavior changes.

**Goal:** Build a static WebM-only anime library, safely optimize the supplied Space Patrol Luluco and Burn-Up W sources, publish both entries, and document the workflow for users and agents.

**Architecture:** Add dedicated `animeTitles` and `animeVideos` content collections with static archive/title/watch routes. Extend managed media with `/media/anime/`, byte-range delivery, validation, and synchronization inventory support. Add a manifest-driven transactional VP9/Opus optimizer; the UI uses native video controls and ordinary anchors without anime-specific client JavaScript.

**Tech Stack:** Astro 7, TypeScript, Bun, YAML, ffmpeg/ffprobe, VP9/Opus WebM, Sharp/WebP, Caddy.

**Spec:** `docs/superpowers/specs/2026-08-25-anime-video-library-design.md`

## Global Constraints

- Delivery is WebM-only: VP9 Profile 0 video and Opus audio; no MP4 fallback.
- The anime feature adds no client-side JavaScript or player library.
- All heavy media lives under `MEDIA_ROOT/anime`; repository content contains only root-relative `/media/anime/...` references.
- Supplied source files are read-only and must never be changed, moved, or deleted.
- Optimizer destinations are create-only; any collision aborts before transcoding.
- `MEDIA_ROOT/.astrosphere/` remains private and is never served or synchronized.
- Burn-Up W is one watchable entry labeled accurately as a four-part OVA compilation.
- Work directly in the existing workspace without Git operations.

## File Structure

### New production files

- `src/lib/anime-references.ts` — validate title/video relationships and ordering constraints.
- `src/lib/media/video-manifest.ts` — parse and normalize version 1 optimizer manifests.
- `src/lib/media/video-probe.ts` — model ffprobe output, resolve streams, build/verify WebM commands.
- `src/lib/media/video-optimizer.ts` — dry-run planning, staging, verification, and atomic videos-directory installation.
- `src/components/AnimeCard.astro` — archive/Shelf card.
- `src/components/AnimeMeta.astro` — title metadata definition list.
- `src/components/AnimeEpisodeList.astro` — ordered episodes/extras.
- `src/components/AnimePlayer.astro` — one native WebM player and variant links.
- `src/components/AnimeWatchPage.astro` — shared series watch layout.
- `src/pages/anime/index.astro` — anime archive.
- `src/pages/anime/[slug]/index.astro` — series detail or movie-style player page.
- `src/pages/anime/[slug]/[video].astro` — default series variant.
- `src/pages/anime/[slug]/[video]/[variant].astro` — alternate series variant.
- `src/content/anime/titles/space-patrol-luluco.md`
- `src/content/anime/titles/burn-up-w.md`
- `src/content/anime/videos/*.md` — 13 Luluco episodes, NCED extra, and Burn-Up W compilation.
- `media-manifests/2026-08-25-space-patrol-luluco-video.yaml`
- `media-manifests/2026-08-25-burn-up-w-video.yaml`
- `docs/anime-library-guide.md`
- `docs/anime-agent-guide.md`

### Existing files to modify

- `src/content.config.ts`, `src/types/content.ts`
- `src/lib/content.ts`, `src/lib/shelf.ts`, `src/config/shelf.ts`, `src/config/navigation.ts`
- `src/lib/media/types.ts`, `config.ts`, `paths.ts`, `server.ts`, `content-source.ts`, `references.ts`, `validator.ts`, `sync.ts`, `cli.ts`
- `scripts/media.ts`, `astro.config.mjs`, `ops/Caddyfile`
- `src/pages/shelf/index.astro`, `src/pages/tags/[tag].astro`, `src/pages/search.astro` only where their existing data model requires anime inclusion
- `docs/agent-workflows.md`, `AGENTS.md`
- focused test files listed below

---

### Task 1: Add the anime media namespace and byte-range delivery

**Files:**

- Modify: `src/lib/media/types.ts`
- Modify: `src/lib/media/config.ts`
- Modify: `src/lib/media/paths.ts`
- Modify: `src/lib/media/server.ts`
- Modify: `astro.config.mjs`
- Modify: `ops/Caddyfile`
- Test: `tests/media-paths.test.ts`
- Test: `tests/media-server.test.ts`
- Test: `tests/caddy-media.test.ts`

**Interfaces:**

- `MediaLayout.anime: string`
- `MediaNamespace = "manga" | "images" | "anime"`
- `parseSingleByteRange(header: string | undefined, size: number): { start: number; end: number } | undefined`
- `planMediaResponse({ method, pathname, root, rangeHeader? })`
- File plans expose `status: 200 | 206`, `start`, `end`, and complete response headers; errors may return `416`.

- [ ] **Step 1: Write failing path and MIME tests**

Add literal expectations:

```ts
expect(resolveMediaUrl("/media/anime/show/videos/01/japanese.webm", "/srv/media")).toMatchObject({
  namespace: "anime",
  filePath: "/srv/media/anime/show/videos/01/japanese.webm",
});
expect(contentTypeForMediaFile("episode.webm")).toBe("video/webm");
expect(() => resolveMediaUrl("/media/anime/../.astrosphere/secret.webm", "/srv/media")).toThrow();
```

- [ ] **Step 2: Run the path test and verify RED**

Run: `bun test tests/media-paths.test.ts`

Expected: failure because `/media/anime/` and `.webm` are not managed.

- [ ] **Step 3: Implement namespace/path support minimally**

Add `anime` to `MediaLayout`, `getMediaLayout()`, the managed routes table, and WebM MIME handling. Keep image-only helpers from treating WebM as a thumbnail source by checking the URL prefix/kind at their current boundaries.

- [ ] **Step 4: Write failing range-plan tests**

Use a real temporary WebM-shaped file/stat and assert:

```ts
expect(await planMediaResponse({
  method: "GET",
  pathname: "/media/anime/show/episode.webm",
  root,
  rangeHeader: "bytes=100-199",
})).toMatchObject({
  kind: "file",
  status: 206,
  start: 100,
  end: 199,
  headers: {
    "Accept-Ranges": "bytes",
    "Content-Length": "100",
    "Content-Range": "bytes 100-199/1000",
    "Content-Type": "video/webm",
  },
});
```

Cover open-ended (`bytes=900-`), suffix (`bytes=-100`), `HEAD`, multi-range rejection, and unsatisfiable `416`.

- [ ] **Step 5: Run the range test and verify RED**

Run: `bun test tests/media-server.test.ts`

Expected: failure because the server always plans status 200 and has no range parsing.

- [ ] **Step 6: Implement range planning and response slicing**

Pass the incoming `Range` header from both Bun and Astro development servers. For Astro, call `createReadStream(plan.filePath, { start: plan.start, end: plan.end })`; for Bun, return the corresponding `Bun.file(...).slice(start, end + 1)`. Preserve containment, canonical path, and private-operations checks.

- [ ] **Step 7: Add and implement the Caddy anime handler**

Write the failing assertion first, then add a `handle_path /media/anime/*` block rooted at `/srv/astrosphere/media/anime`, before the general site handler, with immutable caching. Caddy's file server supplies byte ranges.

- [ ] **Step 8: Verify Task 1 GREEN**

Run: `bun test tests/media-paths.test.ts tests/media-server.test.ts tests/caddy-media.test.ts`

Expected: all pass with unchanged manga/image behavior.

### Task 2: Define anime content schemas, queries, and relationships

**Files:**

- Modify: `src/content.config.ts`
- Modify: `src/types/content.ts`
- Modify: `src/lib/content.ts`
- Create: `src/lib/anime-references.ts`
- Test: `tests/anime-schema.test.ts`
- Test: `tests/anime-content.test.ts`

**Interfaces:**

- `AnimeTitleEntry = CollectionEntry<"animeTitles">`
- `AnimeVideoEntry = CollectionEntry<"animeVideos">`
- `getPublishedAnimeTitles()`
- `getPublishedAnimeVideos()`
- `getAnimeTitleBySlug(slug)`
- `getAnimeVideosForTitle(slug)`
- `getAnimeVideoVariant(video, variantSlug?)`
- `validateAnimeReferences({ titles, videos }): AnimeReferenceIssue[]`

- [ ] **Step 1: Write failing schema tests**

Load `src/content.config.ts` and add fixture-driven schema assertions for title kinds/formats and video variant rules. The behavior to protect is: a published episode without a positive number, a missing default variant, duplicate variant slugs, or a non-WebM source must fail validation.

- [ ] **Step 2: Run schema tests and verify RED**

Run: `bun test tests/anime-schema.test.ts`

Expected: failure because the collections and schemas do not exist.

- [ ] **Step 3: Implement the two collections and exported types**

Use the exact fields in the approved spec. Add super-refinements for episode numbering, unique variant slugs, existing default variants, and `/media/anime/*.webm` sources. Register both collections in `collections`.

- [ ] **Step 4: Write failing query/reference tests**

Use literal title/video fixtures and assert numbered episodes sort before extras, a missing parent title is reported, duplicate episode numbers are reported, and a movie-style title rejects two published `movie` items.

```ts
expect(sortAnimeVideos([extra, episode2, episode1]).map((entry) => entry.data.slug))
  .toEqual(["episode-1", "episode-2", "clean-ending"]);
```

- [ ] **Step 5: Implement query and relationship helpers**

Add collection queries to `content.ts`, keep sorting server-side, and call `validateAnimeReferences()` from `assertPublishingGuardrails()`. Published videos may reference only a published title.

- [ ] **Step 6: Verify Task 2 GREEN**

Run: `bun test tests/anime-schema.test.ts tests/anime-content.test.ts tests/publishing-guard.test.ts`

Expected: all pass.

### Task 3: Parse reviewed video manifests and expose the CLI

**Files:**

- Create: `src/lib/media/video-manifest.ts`
- Modify: `src/lib/media/cli.ts`
- Modify: `scripts/media.ts`
- Test: `tests/media-video-manifest.test.ts`
- Modify: `tests/media-cli.test.ts`

**Interfaces:**

```ts
type VideoStreamSelector = { language?: string; title?: string; index?: number };
type VideoManifestVariant = {
  label: string;
  source: string;
  output: string;
  audio: VideoStreamSelector;
  subtitle?: VideoStreamSelector & { mode: "burn" | "none" };
};
type VideoManifest = { version: 1; title: string; variants: VideoManifestVariant[] };
type VideoOptimizeCommandOptions = {
  kind: "video";
  sourceRoot: string;
  manifest: string;
  dryRun: boolean;
};
```

- [ ] **Step 1: Write failing manifest normalization tests**

Assert a valid manifest normalizes selectors and preserves item order. Add literal rejection cases for unsupported version, unsafe source paths, absolute source paths, outputs outside `/media/anime/<title>/videos/`, non-`.webm` destinations, duplicate portable destination keys, multiple title roots, empty labels, selector objects with no fields, and subtitle mode other than `burn`/`none`.

- [ ] **Step 2: Run manifest tests and verify RED**

Run: `bun test tests/media-video-manifest.test.ts`

Expected: missing module failure.

- [ ] **Step 3: Implement strict YAML parsing**

Use `yaml`, explicit type guards, NFC/case-folded destination collision keys, the existing slug convention, and containment checks. Do not expand globs or infer streams from filenames.

- [ ] **Step 4: Write failing CLI tests**

```ts
expect(parseOptimizeArgs([
  "video", "/sources/luluco", "--manifest", "manifest.yaml", "--dry-run",
])).toEqual({
  kind: "video",
  sourceRoot: "/sources/luluco",
  manifest: resolve("manifest.yaml"),
  dryRun: true,
});
```

Also assert missing/duplicate manifest, unexpected image flags, and extra positionals fail.

- [ ] **Step 5: Implement the CLI branch without changing image behavior**

Make the existing image return shape explicitly `kind: "image"`; branch in `scripts/media.ts` before calling the current image optimizer. Update help text with both syntaxes.

- [ ] **Step 6: Verify Task 3 GREEN**

Run: `bun test tests/media-video-manifest.test.ts tests/media-cli.test.ts`

Expected: all pass, including existing reader/gallery parsing.

### Task 4: Build the transactional VP9/Opus optimizer

**Files:**

- Create: `src/lib/media/video-probe.ts`
- Create: `src/lib/media/video-optimizer.ts`
- Modify: `scripts/media.ts`
- Test: `tests/media-video-probe.test.ts`
- Test: `tests/media-video-optimizer.test.ts`
- Test: `tests/media-video-integration.test.ts`

**Interfaces:**

- `probeVideo(path, runner): Promise<ProbedVideo>`
- `selectVideoStream(probe, type, selector): ProbedStream`
- `createVideoCommand(item): string[]`
- `verifyWebm(path, expected, runner): Promise<VerifiedWebm>`
- `optimizeVideoManifest({ sourceRoot, manifestPath, mediaRoot, dryRun }, adapters?): Promise<VideoOptimizeResult>`

- [ ] **Step 1: Write failing ffprobe parsing and selector tests**

Use complete literal ffprobe JSON matching the observed Luluco and Burn-Up W structures. Assert language/title selection, exact-index fallback, ambiguity errors, wrong codec-type errors, and missing-stream errors.

- [ ] **Step 2: Run probe tests and verify RED**

Run: `bun test tests/media-video-probe.test.ts`

Expected: missing module failure.

- [ ] **Step 3: Implement probing, selection, and command construction**

Require `ffmpeg` and `ffprobe`. The Luluco burn command must map the selected PGS stream through an overlay filter and encode:

```text
libvpx-vp9, yuv420p, crf 28, b:v 0, deadline good, cpu-used 2,
row-mt 1, tile-columns 2, libopus 160k, stereo
```

The Burn-Up W path uses `-c copy` only when probe data already reports VP9 Profile 0, `yuv420p`, Opus stereo, dimensions no larger than 1920×1080, and no requested burn subtitle. Strip unneeded streams and metadata in both paths.

- [ ] **Step 4: Write failing transaction tests**

Name the break each test catches: source escape, output collision, insufficient space, partial install after second conversion failure, source mutation, invalid staged codec, duration drift, missing cues/seek failure, and stale staging cleanup. Assert real filesystem outcomes in a temporary media root.

- [ ] **Step 5: Run transaction tests and verify RED**

Run: `bun test tests/media-video-optimizer.test.ts`

Expected: missing optimizer failure.

- [ ] **Step 6: Implement dry-run and atomic installation**

Probe every item before creating staging. Stage the complete `<title>/videos` tree under `MEDIA_ROOT/.astrosphere/video-operations/<operation-id>/videos`, verify every file, then rename it to `MEDIA_ROOT/anime/<title>/videos` only after the batch passes. The final videos directory must not exist. Record a private JSON result; remove failed staged media. Never write to `sourceRoot`.

- [ ] **Step 7: Add one real tiny-video integration test**

Generate a one-second VP9/Opus fixture in a temporary directory using installed ffmpeg, run the real optimizer/remux path, and verify with real ffprobe. Skip only with an explicit missing-tool reason; do not check in the fixture.

- [ ] **Step 8: Wire the CLI report**

Dry run prints source, selected streams, action (`transcode` or `remux`), and destination. Apply prints installed file count, original/output bytes, and operation-record path. Translate tool failures into `MediaError("optimization", ...)`.

- [ ] **Step 9: Verify Task 4 GREEN**

Run: `bun test tests/media-video-probe.test.ts tests/media-video-optimizer.test.ts tests/media-video-integration.test.ts tests/media-optimizer-transaction.test.ts`

Expected: all pass without changing image optimization.

### Task 5: Extend managed references, validation, and sync inventory

**Files:**

- Modify: `src/lib/media/content-source.ts`
- Modify: `src/lib/media/references.ts`
- Modify: `src/lib/media/validator.ts`
- Modify: `src/lib/media/sync.ts`
- Modify: `tests/media-content-source.test.ts`
- Modify: `tests/media-validator.test.ts`
- Modify: `tests/media-sync.test.ts`

**Interfaces:**

- `MediaContentCollection` includes `animeTitles` and `animeVideos`.
- Anime references include title poster/art, video poster, and every variant `src`.
- `MediaFileInspection` distinguishes image formats, `webm`, and unknown bytes.

- [ ] **Step 1: Write failing content/reference tests**

Assert content paths map correctly and published anime references are collected. A WebM referenced only by an archived video must not become a required published reference.

- [ ] **Step 2: Write failing WebM validation tests**

Use the EBML prefix `1A 45 DF A3` and assert matching `.webm` passes, a mismatched header fails `format-mismatch`, missing files fail, and an unreferenced WebM becomes an orphan.

- [ ] **Step 3: Write failing sync inventory tests**

Extend the temporary tree assertion with `anime/show/videos/01/japanese.webm`; accept `anime/` in safe remote paths and continue excluding `.astrosphere`.

- [ ] **Step 4: Implement the three integrations**

Scan `layout.anime` alongside manga/images. Keep Sharp metadata work image-only. Update public path reconstruction and sync path allowlists to include `anime/` without broadening to arbitrary root directories.

- [ ] **Step 5: Verify Task 5 GREEN**

Run: `bun test tests/media-content-source.test.ts tests/media-validator.test.ts tests/media-sync.test.ts`

### Task 6: Build static anime archive, title, and watch pages

**Files:**

- Create: `src/components/AnimeCard.astro`
- Create: `src/components/AnimeMeta.astro`
- Create: `src/components/AnimeEpisodeList.astro`
- Create: `src/components/AnimePlayer.astro`
- Create: `src/components/AnimeWatchPage.astro`
- Create: `src/pages/anime/index.astro`
- Create: `src/pages/anime/[slug]/index.astro`
- Create: `src/pages/anime/[slug]/[video].astro`
- Create: `src/pages/anime/[slug]/[video]/[variant].astro`
- Modify: `src/config/navigation.ts`
- Modify: `src/config/shelf.ts`
- Modify: `src/lib/shelf.ts`
- Modify: `src/pages/shelf/index.astro`
- Modify: `src/lib/content.ts` tag aggregation/results
- Modify tag/search renderers only as required by their typed return shapes
- Test: `tests/anime-routes.test.ts`
- Test: `tests/anime-player.test.ts`
- Modify: `tests/shelf-content.test.ts`
- Modify: `tests/header-layout.test.ts`

**Interfaces:**

- `getAnimePublicPath(title): /anime/<slug>`
- `getAnimeWatchPath(titleSlug, videoSlug, variantSlug?, defaultVariant?): string`
- `AnimePlayer` receives one video, one selected variant, and an optional title poster.

- [ ] **Step 1: Write failing route and player tests**

Assert static path generation uses published data, default and alternate variant paths are canonical, movie titles render their player on `/anime/[slug]`, and the generated player contains exactly one `<video controls preload="metadata">`, a `video/webm` source, fallback download link, and ordinary variant anchors.

Assert anime components do not contain `<script`, `client:`, HLS, DASH, autoplay, or a second video element.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `bun test tests/anime-routes.test.ts tests/anime-player.test.ts`

Expected: missing routes/components.

- [ ] **Step 3: Implement components using existing visual conventions**

Reuse `BaseLayout`, `ArchivePageHeader`, `Breadcrumbs`, tokens, focus behavior, and responsive breakpoints. Series episode ordering comes only from server-side helpers. Alternate variants and previous/next navigation are anchors. The movie page calls the same player with its one compilation record.

- [ ] **Step 4: Add archive/Shelf/navigation integration**

Add `Anime` to primary and library navigation. Add `animeSlugs: ["space-patrol-luluco", "burn-up-w"]` to Shelf configuration and render a compact Anime section. Include anime tags/search filters without changing unrelated result ordering.

- [ ] **Step 5: Verify Task 6 GREEN**

Run: `bun test tests/anime-routes.test.ts tests/anime-player.test.ts tests/shelf-content.test.ts tests/header-layout.test.ts`

Expected: all pass.

### Task 7: Research final metadata/artwork and create reviewed manifests

**Files:**

- Create: `media-manifests/2026-08-25-space-patrol-luluco-video.yaml`
- Create: `media-manifests/2026-08-25-burn-up-w-video.yaml`
- External output: `MEDIA_ROOT/anime/space-patrol-luluco/`
- External output: `MEDIA_ROOT/anime/burn-up-w/`

- [ ] **Step 1: Resolve authoritative metadata and artwork URLs**

Use the official TRIGGER/Luluco pages for Luluco staff, production, episode count, and key art. Use the archived AIC/ADV release pages or a reliable catalog for Burn-Up W; record that it is four OVAs from 1996. Use the official/release artwork URL and credit; fall back to the supplied Burn-Up PNG only if no usable release image can be retrieved promptly.

- [ ] **Step 2: Inspect every source stream**

Run ffprobe over all 14 Luluco files and the Burn-Up W WebM. Confirm stream selectors are consistent across episodes and make NCED its own Japanese-only item. Do not rely on the Burn-Up W language tag; inspect/confirm the actual presentation and use an exact stream index.

- [ ] **Step 3: Write both manifests**

Luluco contains 27 outputs: 13 Japanese-subbed, 13 English-dub, and one Japanese NCED. Burn-Up W contains one Japanese-subbed compilation output eligible for remux. Every source filename is relative and every destination is exact.

- [ ] **Step 4: Run manifest/parser tests and optimizer dry runs**

Run:

```sh
bun run media:optimize video "/Volumes/TOSHIBA HDD/Anime/[RH] Uchuu Patrol Luluco [Dual Audio] [BDRip] [Hi10] [1080p]" --manifest media-manifests/2026-08-25-space-patrol-luluco-video.yaml --dry-run
bun run media:optimize video "/Volumes/SSD Mac/Burn up W movie" --manifest media-manifests/2026-08-25-burn-up-w-video.yaml --dry-run
```

Expected: 27 Luluco variants resolve to transcode, one Burn-Up W variant resolves to remux, and no destination exists.

- [ ] **Step 5: Download and optimize credited artwork**

Place downloads in a temporary directory, then use the existing image optimizer to create WebP artwork beneath each exact `MEDIA_ROOT/anime/<slug>` directory. Check dimensions and visual rendering; do not hotlink or copy artwork into `public/`.

- [ ] **Step 6: Apply video optimization**

Run the two approved commands without `--dry-run`, one title at a time. Do not synchronize or delete sources. Record counts, output bytes, and operation records. If a batch fails, fix the single cause and rerun only that title after confirming no final videos directory was installed.

### Task 8: Add the two published anime entries

**Files:**

- Create: `src/content/anime/titles/space-patrol-luluco.md`
- Create: `src/content/anime/titles/burn-up-w.md`
- Create: `src/content/anime/videos/space-patrol-luluco-*.md`
- Create: `src/content/anime/videos/burn-up-w-compilation.md`
- Test: `tests/anime-entry-content.test.ts`

- [ ] **Step 1: Write failing entry-content tests**

Assert Luluco has exactly 13 numbered episodes plus one extra, every episode has Japanese-subbed default and English-dub variants, NCED has one variant, Burn-Up W has one movie item and one variant, all sources end in `.webm`, and all artwork/video URLs begin `/media/anime/<matching-slug>/`.

- [ ] **Step 2: Run entry tests and verify RED**

Run: `bun test tests/anime-entry-content.test.ts`

Expected: files missing.

- [ ] **Step 3: Create source-backed title and video documents**

Use measured durations and researched English/romanized titles. Luluco tags: action, comedy, romance, science-fiction, space, police, trigger. Burn-Up W tags: action, comedy, science-fiction, police, mecha, 1990s-anime; put nudity/violence in `contentWarnings`, not tags. Credit artwork and metadata URLs.

- [ ] **Step 4: Verify Task 8 GREEN**

Run: `bun test tests/anime-entry-content.test.ts tests/anime-content.test.ts`

Expected: all pass.

### Task 9: Write user/agent guides and perform final verification

**Files:**

- Create: `docs/anime-library-guide.md`
- Create: `docs/anime-agent-guide.md`
- Modify: `docs/agent-workflows.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Write the user guide**

Cover browsing, series/movie layout, native playback, language switching via links, downloads, WebM-only compatibility (including Safari 17.4+ on iPhone/iPad), and the exact dry-run/apply command shape. State that no watch progress is stored.

- [ ] **Step 2: Write the agent guide**

Cover source inspection, authoritative metadata/artwork research, schema fields, stream selectors, manifest review, dry run, create-only transaction, artwork placement, content creation, validation, and forbidden actions. Include the rule that Burn-Up W remains labeled an OVA compilation.

- [ ] **Step 3: Add concise workflow pointers**

Add the shortest supported anime workflow to `docs/agent-workflows.md` and an `AGENTS.md` pointer. Do not document sync, prune, deployment, replacement, or deletion as part of adding anime.

- [ ] **Step 4: Self-review changed behavior and content**

Confirm no anime component adds JavaScript, every managed reference exists, all 28 WebMs have correct EBML headers, source/output counts match manifests, variant labels match audio/subtitle choices, and no repository file contains an absolute source-volume path except the operational plan/guide examples where intentionally documented.

- [ ] **Step 5: Run final verification once**

Because shared code and schemas changed, run:

```sh
bun test
bun run media:validate
bun run astro check
```

Expected: tests pass; media validation reports zero errors and no anime orphans; Astro reports zero errors. Do not repeat a passing command against unchanged files.

- [ ] **Step 6: Handoff**

Report the two URLs, title/video counts, WebM variant counts, optimized sizes, artwork sources, checks run, WebM browser floor, and any genuine metadata uncertainty. State explicitly that no sync, deployment, Git operation, or source deletion occurred.
