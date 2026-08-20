## Development

- Work directly on the main branch unless explicitly told otherwise.
- Do not run Git commands or otherwise modify Git state unless explicitly requested.
- Manga creator frontmatter uses `{ name, slug }` entries for `authors` and `artists`; use the internal `/manga/creators/{slug}` pages and never paste Mangadex creator URLs into manga content.
- Keep all heavy manga, doujinshi, and image-set binaries out of the repository. Manga files belong under the external `MANGA_MEDIA_ROOT`; image-set galleries belong under the external `IMAGE_SET_MEDIA_ROOT` (locally `/Users/astrochan/Documents/Workstation/astrosphere-media/images`). Keep their frontmatter URLs root-relative (`/manga/...` or `/media/images/...`) so the external media server and VPS Caddy configuration can serve them.
- Astro dev serves `/media/images/*` from `IMAGE_SET_MEDIA_ROOT`; do not “fix” local image 404s by copying galleries into `public/`. Keep the external root populated and let the dev server route handle both local and deployed image-set URLs.

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Trails and reading progress

- Trail order is defined by the `items` array in `src/content/trails/*.md`; never infer or reorder trail steps in a page component.
- Use `getTrailItemTargets()` and `getTrailProgressForArtifact()` from `src/lib/content.ts` to resolve trail entries and calculate the current position. Keep this work server-rendered.
- Use `src/components/TrailProgress.astro` for the visual progress indicator. It renders linked dots plus previous/next arrow links, including support for external signal entries.
- Trail progress belongs immediately after the article body, before supporting media, transcripts, or related links.
- Keep the feature JavaScript-free. Navigation must use ordinary anchors, and progress must be derived from the current page URL/content rather than client-side reading state.
- Preserve accessibility: keep the progress navigation labelled, give each dot and arrow a meaningful accessible name, use `aria-current="page"` for the current stop, and retain visible keyboard focus styles.
- Completed dots and connecting lines use `var(--color-accent)`; upcoming steps use the existing border/muted colors. Do not introduce a separate trail-progress color system.

## Artifact media deduplication

- Treat an artifact's `hero` image as its banner, `media` entries as its supporting gallery, and Markdown body images as editorial illustrations.
- Do not repeat the same image in all three places. If an image is already used by `hero` or `media`, omit it from the Markdown body unless there is a specific editorial reason to show it again in context.
- When a body image is useful, prefer a distinct asset and keep its placement tied to the surrounding text. For gallery-style essays, the media gallery should normally carry the image set while the body provides context and captions without duplicating the gallery.

## BLACKSOULS character galleries

- Character pages may include large source-faithful galleries and H-scene route documentation; sanitize downloaded images into `IMAGE_SET_MEDIA_ROOT` and keep only root-relative `/media/images/...` references in content.
- When generating raw HTML galleries in Markdown, write real line breaks—not literal `\\n` text—between `<figure>` elements. Before handoff, verify that image-reference count equals the unique-reference count, every reference has a corresponding external WebP, and `bun run astro check` passes.
