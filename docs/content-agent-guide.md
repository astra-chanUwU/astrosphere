# AstroSphere content agent guide

Use this guide when creating or editing site content. The site is a static, discovery-first mixed-media archive: publish durable pages, connect them deliberately, and keep the writing human.

## Core rules

- Use Markdown for normal writing. Use MDX only when the body genuinely needs an Astro component or structured interactive element.
- Create one durable item per file. Do not make feed-like posts, invented updates, or placeholder content.
- Use lowercase hyphenated `slug` values. A published slug is permanent: never change one without an explicit redirect plan.
- Use `status: draft` until the content and all local media exist. Use `status: published` only when ready for public discovery.
- Do not invent facts, dates, quotes, credits, ownership, or source URLs. Clearly label supplied personal perspective as personal perspective.
- Use only supplied local assets or URLs explicitly provided by the owner. Preserve rights and credits in frontmatter.
- Prefer a small number of purposeful tags. Tags are lowercase hyphenated and describe the work, not vague mood.
- Every `spheres`, `related`, trail item, or parent reference must point to an existing entry's frontmatter `slug`.

## Where content belongs

| Content | Folder | Required frontmatter focus |
| --- | --- | --- |
| Essay, note, image set, audio, video, reference, experiment, or link | `src/content/artifacts/<type>/` | `type`, `publishedAt`, `spheres`, `tags` |
| Thematic place | `src/content/spheres/` | `palette`, `order` |
| Curated path through archive items | `src/content/trails/` | ordered `items` |
| External recommendation | `src/content/signals/` | `url`, `category`, `rating`, `visitedAt` |
| Manga series or chapter | `src/content/manga/series/` or `src/content/manga/chapters/` | use the dedicated manga schema |
| Fixed site page | `src/content/pages/` | `pageType` |

## Artifact template

```yaml
---
slug: lowercase-hyphenated-id
title: Clear human title
type: essay # essay | note | image-set | audio | video | link | experiment | reference
status: draft # change to published only when complete
summary: One precise sentence describing what this is.
publishedAt: "2026-08-08"
spheres: [art]
tags: [illustration, art-book]
layout: standard # standard | feature | gallery | field-note | experiment
featured: false
hero:
  kind: image
  src: /media/images/example.jpg
  alt: Describe what the image shows.
  credit: Creator or source, when supplied.
media: []
related: []
sourceUrl: https://example.com/source
credits: []
---
```

Omit optional fields rather than filling them with placeholders. Quote YAML strings containing `:`, `#`, brackets, leading punctuation, or values that might become dates/numbers/booleans.

## Sphere template

```yaml
---
slug: art
title: Art
status: published
summary: A concise description of the territory.
palette: mineral # paper | moss | ember | ocean | dusk | mineral
order: 45
accentLabel: Images, objects, and visual worlds
shortLabel: Art
---
```

Spheres are broad territories, not tags. Reuse an existing sphere when it fits; create a new one only for a lasting branch with multiple future artifacts.

## Media rules

- Store images at `public/media/images/<topic>/`, audio at `public/media/audio/<topic>/`, and video at `public/media/video/<topic>/`.
- Reference local files with root-relative paths, for example `/media/images/shirow/artwork-01.webp`.
- Use descriptive, lowercase hyphenated filenames. Preserve source format only when needed; WebP is preferred for ordinary web images.
- Every image needs useful `alt`. Add `caption` when context matters and `credit` whenever it is known or supplied.
- Do not use a hero merely because an image exists. Feature and gallery layouts benefit from intentional visual hierarchy.

## Writing and linking

- Lead with what the artifact is and why it belongs in the archive.
- Use headings for substantial pieces, short paragraphs, direct language, and descriptive link text.
- Link related AstroSphere entries through frontmatter `related`; link outside sources in the body or `sourceUrl`.
- Put a work in more than one sphere only when both are genuinely useful discovery paths.
- A trail is for a curated sequence, not for every set of related posts.

## Before finishing

1. Check YAML indentation and quote unsafe scalar values.
2. Confirm the slug is unique and every relationship slug exists.
3. Confirm every local media path exists exactly, including file extension and case.
4. Confirm external URLs are HTTPS and explicitly supplied or verified by the task.
5. Keep incomplete work as `draft`.
6. Run `bun test`, `bunx astro check`, and `bun run build` before declaring the work finished.

For complete field definitions and examples, read [the content model](./content-model.md) and the schemas in `src/content.config.ts`.
