# Anime library guide

AstroSphere’s anime library lives at `/anime`. It is a static, WebM-only library: pages use the browser’s native video controls and ordinary links, without a custom player or anime-specific JavaScript.

## Browsing and watching

- Open `/anime` to browse every published title. Curated anime also appears on `/shelf`.
- A series page lists numbered episodes first and extras afterward. Choose an episode to open its watch page.
- A movie-style entry, including an OVA compilation, places its primary player directly on the title page.
- Use the labelled links beneath an episode to change between Japanese audio with English subtitles and the English dub. Each link opens one static page with one player.
- Previous and next episode links are below the player.
- Use **Download this WebM** to save the exact file or when native playback is unavailable.

The site does not store watch history, playback position, or episode progress.

## Browser compatibility

Every video is VP9 Profile 0 video with Opus audio in a `.webm` container. There is no MP4 fallback. Use a current Firefox, Chromium-based browser, or Safari. On iPhone and iPad, Safari 17.4 or newer is the supported floor; older Apple browsers may not play these files.

## Preparing personal source material

Anime masters stay outside the repository. Managed artwork and videos are written beneath `MEDIA_ROOT/anime/<title-slug>/`, and published content uses root-relative `/media/anime/...` URLs.

Create a reviewed YAML manifest that names every output, its relative source file, and exact audio/subtitle streams. Preview it first:

```sh
bun run media:optimize video "/absolute/path/to/source-folder" --manifest media-manifests/YYYY-MM-DD-title-video.yaml --dry-run
```

Apply the identical reviewed command without `--dry-run`:

```sh
bun run media:optimize video "/absolute/path/to/source-folder" --manifest media-manifests/YYYY-MM-DD-title-video.yaml
```

The command is create-only. It refuses existing video destinations, stages the complete set privately, verifies every result, and publishes the `videos` directory only after the whole manifest succeeds. It never edits or deletes the source folder.

After adding the matching title/video content and optimized WebP artwork, run:

```sh
bun run media:validate
bun run astro check
```

See [the agent guide](./anime-agent-guide.md) for manifest fields, stream inspection, metadata research, and safety rules.
