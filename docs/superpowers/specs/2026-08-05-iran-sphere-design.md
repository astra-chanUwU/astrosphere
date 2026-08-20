# Iran Sphere Design

## Goal

Add a durable place in AstroSphere for personal writing, family-held images, and historical material about Iran, beginning with Ancient Persia and the Pahlavi era.

## First entry

`The Mossadegh Myth` is an authored Pahlavi-oriented essay adapted from Astro Chan's supplied thread. It is presented as a personal archive entry, uses only supplied wording and images, and links to the original thread as source material.

## Content structure

- `spheres/iran.md` establishes the public sphere with the ember palette.
- `artifacts/essays/the-mossadegh-myth.md` is a feature essay in that sphere.
- Image files live below `public/media/history/iran/mossadegh-myth/`, using lowercase, hyphenated filenames for stable public URLs.
- Each image appears next to its relevant section; no separate gallery duplicates the narrative sequence.

## Validation

The existing production publishing guard checks the sphere reference and every local image reference during build. `bun test`, `bunx astro check`, and `bun run build` are the acceptance checks.
