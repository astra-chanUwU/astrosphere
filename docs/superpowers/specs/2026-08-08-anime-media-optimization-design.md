# Anime Sphere Media Optimization

## Goal

Optimize all raster images stored under `public/media/anime` as WebP assets and remove duplicate hero images from Anime Sphere article bodies. Audio and video assets remain unchanged.

## Design

Each supported raster source (`.jpg`, `.jpeg`, `.png`, or `.avif`) will be converted with the project’s existing `cwebp` command at the established quality setting. The output keeps the original basename and directory, changing only the extension to `.webp`. Existing WebP files are retained as the canonical output and are not reconverted. After each output is validated, the source raster is removed.

All references to converted Anime Sphere images in frontmatter and Markdown body content will be updated to the corresponding `.webp` path. The hero metadata remains in each artifact so cards, social metadata, and the page-level hero continue to work.

For each Anime Sphere article whose first body image exactly matches its hero source, only that first body image Markdown line will be removed. This leaves the page-level hero visible once and preserves all other editorial images and their order. Articles with a distinct first body image are not changed.

## Scope and safety

- Included: raster files below `public/media/anime` and references to those files in Anime Sphere content.
- Excluded: `.mp3`, `.mp4`, `.DS_Store`, files outside `public/media/anime`, and non-duplicate body images.
- Conversion will use temporary output files and validate successful WebP creation before replacing each source.
- No new rendering behavior is needed; the existing artifact page continues to render hero and body content normally.

## Verification

1. Enumerate Anime Sphere raster assets and confirm each has a valid WebP replacement.
2. Search content for stale raster references and duplicate hero/body image pairs.
3. Run the project test suite and production build.
4. Inspect the final diff and confirm audio/video assets are unchanged.
