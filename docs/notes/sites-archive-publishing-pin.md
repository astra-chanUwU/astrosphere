# Sites archive publishing pin

Keep this note attached to the AstroSphere publishing work.

## Current measurement — 2026-08-10

- `dist/`: approximately 585 MB after the Astro production build.
- `public/manga/`: approximately 368 MB.
- `public/media/`: approximately 131 MB.
- The full Sites deployment archive was approximately 494 MB compressed and timed out during upload.
- The source repository push also struggled because the repository contains the large manga/media archive.

## Return path

Investigate a smaller deployment strategy before the next Sites publish attempt: separate manga assets from the main archive, deploy media through a dedicated asset store/CDN, or configure the Astro static build so the publisher can consume a smaller artifact. Do not remove existing manga or media files casually; preserve the current local site while testing a deployment-specific packaging strategy.
