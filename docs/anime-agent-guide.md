# Anime agent guide

Use this workflow to add a source-backed anime series, film, OVA, or OVA compilation. Heavy binaries belong beneath `MEDIA_ROOT/anime`, never in the repository or `public/`.

## Invariants

- Treat source files as read-only. Never rename, move, overwrite, or delete them.
- Delivery is WebM-only: VP9 Profile 0, 8-bit `yuv420p`, and stereo Opus. Do not add MP4, HLS, DASH, or a JavaScript player.
- Use the native player and ordinary anchors. Do not store client-side watch progress.
- Optimization is create-only by default. Existing managed `videos` destinations are collisions unless explicit resume verifies and reuses every declared existing output.
- Keep `MEDIA_ROOT/.astrosphere/` private; it contains staging and operation records.
- An import does not authorize synchronization, deployment, pruning, replacement, Git operations, or source deletion.
- Preserve the actual release form. Burn-Up W is a four-part OVA; a joined local file is an `ova-compilation`, not a theatrical movie.

## 1. Inspect every source

Ignore AppleDouble `._*` files and unrelated artwork. Probe each intended video with `ffprobe` and record duration, dimensions, frame rate, video codec/profile/pixel format, plus every audio and subtitle stream’s absolute index, language, title, channel layout, and codec. Determine whether subtitles are soft streams or already burned into the picture.

Do not trust a filename or language tag when it conflicts with the presentation. Use exact stream indices when tags are absent, wrong, or ambiguous. A missing or ambiguous selector must stop the dry run.

## 2. Research metadata and artwork

Prefer the original studio, official series site, publisher, or release catalog. Verify the authoritative English title and a romanized Japanese `originalTitle` when meaningfully different. Record the real format, release year/dates, episode count, studio, director, synopsis, and reader-facing content warnings.

Download artwork instead of hotlinking it. Prefer official key art or release covers, retain a source URL and credit, and optimize it to WebP beneath `MEDIA_ROOT/anime/<title-slug>/`. A source-supplied image is an acceptable fallback when usable official/release artwork cannot be retrieved promptly; document that provenance.

## 3. Write and review a manifest

Store versioned manifests in `media-manifests/`. Every output is explicit:

```yaml
version: 1
title: example-anime
variants:
  - label: Episode 1 — Japanese audio with English subtitles
    source: "Episode 01.mkv"
    output: /media/anime/example-anime/videos/01/japanese-subbed.webm
    audio: { index: 2 }
    subtitle: { index: 4, mode: burn }
  - label: Episode 1 — English dub
    source: "Episode 01.mkv"
    output: /media/anime/example-anime/videos/01/english-dub.webm
    audio: { language: eng, title: 5.1 FLAC }
    subtitle: { title: Signs & Songs, mode: burn }
```

- `version` is `1`; `title` is the matching lowercase slug.
- `source` is relative to the supplied root and cannot escape it.
- `output` is unique, normalized, beneath `/media/anime/<title>/videos/`, and ends in `.webm`.
- Audio uses either one exact `index` or language/title fields, never both styles.
- Subtitle mode is `burn` or `none`. Omit the selector when no subtitle stream is needed or the picture already contains hard subtitles.
- Labels must exactly describe spoken language and subtitle presentation.

## 4. Preview, then apply

```sh
bun run media:optimize video "/absolute/path/to/source-folder" --manifest media-manifests/YYYY-MM-DD-title-video.yaml --dry-run
bun run media:optimize video "/absolute/path/to/source-folder" --manifest media-manifests/YYYY-MM-DD-title-video.yaml
```

To continue a partial title without replacing completed outputs, preview and then apply with the same explicit flag:

```sh
bun run media:optimize video "/absolute/path/to/source-folder" --manifest media-manifests/YYYY-MM-DD-title-video.yaml --resume --dry-run
bun run media:optimize video "/absolute/path/to/source-folder" --manifest media-manifests/YYYY-MM-DD-title-video.yaml --resume
```

Resume re-probes all sources, fully verifies declared existing WebM outputs, reuses valid files, and creates only missing files. An invalid or undeclared existing file stops the transaction; resume never overwrites it. Omit `--resume` for a fresh create-only title.

Review every source, selected stream, action, and destination before apply. Confirm disk space can hold the full staged output. Transcodes use the approved VP9/Opus profile; a compliant source with no requested subtitle rendering may be losslessly remuxed. A fresh transaction verifies every staged output before installing the complete public `videos` directory. On a fresh-run failure, investigate the single cause and confirm no final directory was installed before retrying that title. On an interrupted partial title, rerun the reviewed command with `--resume`; verified public outputs are preserved and counted as reused.

## 5. Create content

Title documents live in `src/content/anime/titles/`; playable records live in `src/content/anime/videos/`.

Titles include identity, visibility/work status, kind/format, release year, description, rating/content warnings, tags, studio, director, managed artwork, and credited sources. Use `kind: series` for episode lists. Movie-style pages use `kind: movie`, while `format` remains specific (`film`, `ova`, or `ova-compilation`).

Video records include the parent `anime` slug, item kind, episode number where applicable, researched titles, measured duration, publication status, a default variant, and all variants. Each variant records its visible label, language, subtitle presentation, exact managed WebM URL, and dimensions. Do not publish content until all referenced media exists.

## 6. Validate and hand off

```sh
bun run media:validate
bun run astro check
```

Require no missing anime reference, mismatched WebM header, or anime orphan. Confirm manifest/install counts match and labels agree with selected streams. Report title/video/variant counts, output sizes, artwork sources, Safari 17.4+ as the Apple floor, and the out-of-scope operations that were not performed.
