# Anime Video Library Design

## Goal

Add a first-class, static anime library to AstroSphere, publish Space Patrol Luluco as a 13-episode series with a clean-ending extra, and publish the supplied Burn-Up W file as one watchable OVA compilation. Add a safe, repeatable video optimization workflow and separate user and agent guides.

The feature must follow AstroSphere's external-media rules and its no-JavaScript/low-JavaScript philosophy. The initial implementation uses no client-side JavaScript.

## Source Material

### Space Patrol Luluco

- Source directory: `/Volumes/TOSHIBA HDD/Anime/[RH] Uchuu Patrol Luluco [Dual Audio] [BDRip] [Hi10] [1080p]/`
- Contents: episodes 1–13 plus a clean ending (`NCED`).
- Episode masters: 1920×1080, 23.976 fps, 10-bit H.264 High 10, English 5.1 FLAC, Japanese stereo FLAC, English PGS signs-and-songs subtitles, and English PGS dialogue subtitles.
- Approximate source size: 4.8 GB.
- The source format is not a dependable browser-delivery format and requires transcoding.

The published metadata will use the English title `Space Patrol Luluco` and romanized original title `Uchuu Patrol Luluco`. The entry is a completed 2016 TV-short series produced by TRIGGER and directed by Hiroyuki Imaishi. Official TRIGGER and Luluco pages are the primary metadata and artwork sources; a reliable episode catalog may supplement translated episode titles.

### Burn-Up W

- Source directory: `/Volumes/SSD Mac/Burn up W movie/`
- Main source: one 1920×1080 VP9/Opus WebM, approximately 99 minutes and 390 MB.
- The file is a single compilation of the four Burn-Up W OVA episodes and appears to contain Japanese dialogue with hard English subtitles despite an incorrect `eng` stream-language tag.
- The adjacent PNG is source-supplied artwork, but web research will be used to locate and credit a stronger official or release cover when available.

The published metadata will call the entry `Burn-Up W`, classify it as a movie-style entry with format `OVA compilation`, and explain that it combines the four 1996 AIC episodes. It must not claim that Burn-Up W was originally released as a theatrical movie.

## Considered Approaches

### Dedicated anime collections and routes — selected

Create anime-specific metadata, cards, archive pages, title pages, and watch pages. This gives series episodes, compilation videos, language variants, extras, ratings, and staff metadata stable semantics while keeping all pages statically rendered.

### Generic video artifacts

The existing artifact schema and native video frame could hold the files, but thirteen episodes would become an awkward article gallery without episode routing, variant navigation, or an anime archive. This approach is too limited for a reusable anime workflow.

### HLS player with client-side controls

HLS would model alternate audio efficiently, but broad desktop support would require a JavaScript player. It adds packaging, playlists, segment management, and client runtime complexity that is unnecessary for these short initial titles.

## Content Model

Two Astro content collections will be added.

### Anime titles

`src/content/anime/titles/*.md` describes a series or movie-style entry. Each entry contains:

- `slug`
- `title`
- `originalTitle`
- optional `aliases`
- `visibility`: `draft`, `published`, or `archived`
- `status`: `ongoing`, `completed`, `hiatus`, or `cancelled`
- `kind`: `series` or `movie`
- `format`: `tv`, `tv-short`, `film`, `ova`, or `ova-compilation`
- `releaseYear`
- `description`
- `rating`: `safe`, `suggestive`, or `explicit`
- `contentWarnings`, as an optional list of short reader-facing labels
- `tags`
- `studios`
- `directors`
- optional `poster` and supporting `art`
- optional `featured` and `updatedAt`
- `sources`, containing credited metadata and artwork URLs

`Space Patrol Luluco` uses `kind: series` and `format: tv-short`. `Burn-Up W` uses `kind: movie` and `format: ova-compilation`. Burn-Up W receives an accurate nudity/violence warning based on the release content; its rating must not be inferred solely from genre tags.

### Anime videos

`src/content/anime/videos/*.md` describes one playable item. Each entry contains:

- `slug`
- `anime`, referencing an anime-title slug
- `kind`: `episode`, `movie`, or `extra`
- optional positive `number`, required for episodes
- `title`
- optional `originalTitle`
- optional `releasedAt`
- `durationSeconds`
- `status`: `draft`, `published`, or `archived`
- optional `poster`
- `defaultVariant`
- one or more `variants`

Each variant contains:

- `slug`, such as `japanese-subbed` or `english-dub`
- human-readable `label`
- spoken-language label
- subtitle label or `None`
- managed, root-relative WebM `src`
- `width` and `height`

Variant slugs must be unique within a video and `defaultVariant` must name an existing variant. Published videos require at least one playable variant. Series episodes require unique numbers within their parent title. A movie-style title may have only one published `movie` item.

## Routes and Rendering

- `/anime` is the anime archive.
- `/anime/[slug]` is the title page.
- A series title page shows metadata, poster/art, an ordered episode list, and extras after the numbered episodes.
- A movie-style title page includes its primary player directly, avoiding a redundant intermediate watch route.
- `/anime/[slug]/[video]` is the default series watch route.
- `/anime/[slug]/[video]/[variant]` renders a non-default language variant.

Variant and episode switching uses ordinary anchors. Watch pages render exactly one native `<video controls>` element with `preload="metadata"`, no autoplay, an artwork poster, a download fallback, previous/next episode links, and accessible variant labels. The page does not instantiate multiple hidden players and does not add a client-side player library.

Cards and pages use the existing design tokens, borders, typography, focus styles, archive header, breadcrumbs, sidebar, and responsive conventions. Anime will be linked from the Shelf rather than mixed into generic Articles. Tags and search filters include published anime titles.

## Managed Media Layout

Heavy video and artwork remain outside the repository:

```text
MEDIA_ROOT/
  anime/
    space-patrol-luluco/
      poster.webp
      art/
      videos/
        01/
          japanese-subbed.webm
          english-dub.webm
        ...
        nced/
          japanese.webm
    burn-up-w/
      poster.webp
      art/
      videos/
        compilation/
          japanese-subbed.webm
```

Published references use `/media/anime/...`. `MEDIA_ROOT/.astrosphere/` remains private and may hold optimizer staging and operation records, but is never served or synchronized as public media.

The source volumes are read-only inputs. Optimization never edits, moves, or deletes them.

## Video Optimization Command

Extend the existing media command family with:

```sh
bun run media:optimize video <source-root> --manifest <manifest.yaml> --dry-run
bun run media:optimize video <source-root> --manifest <manifest.yaml>
```

The versioned YAML manifest lists relative source filenames and one or more explicit output variants. Each variant declares:

- managed destination beneath `/media/anime/`
- audio selector by language/title, with an exact stream-index fallback when tags are unreliable
- optional subtitle selector by title or stream index
- subtitle mode, initially `burn` or `none`
- human-readable label used for the result report

Manifest destinations must be normalized, unique, root-relative `/media/anime/` paths ending in `.webm`. Source paths must remain inside the supplied source root. AppleDouble files and unrelated artwork are not implicit video inputs. Missing or ambiguous stream selectors are errors, not guesses.

The library is WebM-only. It does not generate an MP4 fallback or add JavaScript-based compatibility playback. The accepted compatibility floor is a modern browser with VP9/Opus WebM support, including Safari 17.4 or newer on iPhone and iPad. The user guide must state that older Apple browsers may not play the library.

The default delivery profile is:

- VP9 Profile 0, 8-bit `yuv420p` video via `libvpx-vp9`
- constant-quality encoding with CRF 28 and no target bitrate
- `good` deadline, CPU-used 2, row multithreading, and two tile columns for 1080p output
- original frame rate and aspect ratio
- maximum source dimensions of 1920×1080 without upscaling
- stereo Opus at 160 kbps
- WebM cues suitable for native byte-range seeking
- original loudness, without automatic normalization

For Luluco, Japanese variants select Japanese FLAC and burn the PGS dialogue track. English variants select English FLAC and burn the signs-and-songs PGS track. The NCED is a Japanese-only extra. These inputs are transcoded to VP9/Opus WebM.

For Burn-Up W, the single source audio is selected explicitly, its hard subtitles are retained in the picture, and no additional subtitle stream is requested. Because the source is already VP9 Profile 0 with Opus audio, the optimizer first attempts a lossless stream-copy remux that rebuilds a normalized, seekable WebM container. It transcodes only if verification shows that the existing streams violate the delivery profile.

### Transaction and verification

Dry-run mode probes all selected inputs, resolves every stream, calculates all destinations, reports the codec work, and writes nothing.

Apply mode:

1. Refuses existing destinations and duplicate manifest outputs.
2. Confirms sufficient destination space for staged output.
3. Writes every result under a private operation-specific staging directory.
4. Checks process exit status and verifies each staged WebM with `ffprobe`.
5. Requires VP9 Profile 0, Opus, positive dimensions and duration, `yuv420p`, seekable WebM cues, and a duration within a small tolerance of the selected input.
6. Installs results only after the entire manifest succeeds.
7. Removes failed staging output while retaining a concise private operation record.

No partial public library is installed after a failed batch. A future replacement mode is outside this first version; existing outputs require an explicit, separately designed update workflow.

## Serving, Seeking, Validation, and Sync

The managed-media layout and URL resolver gain an `anime` namespace. Recognized public extensions are `.webm` and the existing supported image formats.

The local Bun media server must support:

- `GET` and `HEAD`
- valid single `Range` requests with `206`, `Content-Range`, `Content-Length`, and `Accept-Ranges: bytes`
- `416` for unsatisfiable ranges
- correct `video/webm` and image content types
- containment and symlink protections equivalent to existing namespaces

Production Caddy serves `/media/anime/*` from `/srv/astrosphere/media/anime` with immutable caching and native byte-range support. The static site handler must not intercept anime media.

`media:validate` collects poster, art, and video-variant references, detects missing and orphaned anime files, checks WebM EBML signatures, and retains image dimension checks for artwork. Expensive full transcoding probes belong to the optimizer transaction rather than every routine library validation. `media:sync` includes the public anime namespace while continuing to exclude `.astrosphere`.

## Initial Entries

### Space Patrol Luluco

- 13 numbered published episode records with researched English titles, romanized/Japanese titles when reliably available, original air dates when reliably available, and measured local durations.
- Japanese-subbed default and English-dub secondary variants for each numbered episode.
- One `extra` record for the clean ending with its measured duration and Japanese-only variant.
- Official key art downloaded into the managed anime namespace, optimized as WebP, and credited with its source URL and copyright owner.
- Tags centered on action, comedy, romance, science fiction, space, police, and TRIGGER; tags must reflect sourced work metadata rather than torrent filename terms.

### Burn-Up W

- One movie-style title record and one playable compilation video record.
- Metadata identifies the underlying work as a four-part 1996 OVA from AIC directed by Hiroshi Negishi.
- The page summary explains that the local presentation joins the four episodes into one approximately 99-minute watch.
- Web-sourced release artwork is preferred and credited. The supplied PNG is the fallback if a usable release image cannot be retrieved promptly.
- Tags centered on action, comedy, science fiction, police, mecha, and 1990s anime, with content warnings recorded separately from tags.

Artwork is downloaded and served locally rather than hotlinked. Source URLs and credits are retained in content metadata.

## Documentation

Create two guides after the workflow is proven:

- `docs/anime-library-guide.md` for users: browsing, native playback, language variants, downloads, the WebM-only compatibility floor, and adding/optimizing personal source material.
- `docs/anime-agent-guide.md` for agents: authoritative metadata research, content schema, manifest creation, stream inspection, dry-run/apply sequence, storage rules, validation, and collision safety.

Add concise pointers to the anime agent guide from `AGENTS.md` and `docs/agent-workflows.md`. Do not document deployment, prune, replacement, or source deletion as implied parts of an import.

## Error Handling

- Invalid content metadata fails Astro schema validation.
- Missing title/video relationships fail reference validation.
- Unsafe source or destination paths fail before ffmpeg starts.
- Ambiguous audio or subtitle selectors fail before output is written.
- Unsupported or corrupt inputs fail the dry run or staging transaction.
- Missing ffmpeg/ffprobe produces an actionable setup error.
- Existing destinations are never overwritten.
- A failed batch exposes no partial public output and never changes source files.
- Missing managed media blocks a successful validation handoff.

## Verification Strategy

Implementation follows test-first development.

Focused tests cover:

- anime schemas and cross-entry constraints
- public route generation and ordering
- variant URL resolution and zero-client-script rendering
- manifest parsing, selector ambiguity, traversal, duplicate output, and collision refusal
- optimizer transaction behavior and verified install
- WebM signature validation and orphan detection
- local byte-range responses, including `HEAD`, `206`, and `416`
- Caddy anime namespace ordering and cache policy
- the two initial entries' episode/movie shape and managed references

A tiny generated video fixture may exercise real ffmpeg/ffprobe behavior without checking in a binary. Process-boundary tests otherwise use explicit adapters and assert filesystem outcomes rather than mock call counts.

Final verification runs the focused video/anime tests while developing, followed once by `bun run media:validate` and `bun run astro check` after the content and managed media are complete. A full build is reserved for failures that require it or an explicitly requested release.

## Out of Scope

- HLS, DASH, adaptive-bitrate ladders, or a JavaScript player
- MP4 fallbacks or compatibility transcoding for older Apple browsers
- watch-history or client-side reading progress
- user accounts, streaming authorization, or DRM
- automated scraping of metadata or artwork
- OCR conversion of PGS subtitles to WebVTT
- destructive replacement, pruning, deployment, synchronization, commit, or push
- deleting or altering the supplied source media
