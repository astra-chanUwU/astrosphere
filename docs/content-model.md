# AstroSphere content model

AstroSphere is a repository-based mixed-media archive. Content is authored in Markdown or MDX and validated by Astro Content Collections.

For a copyable, agent-facing authoring contract, see [Content agent guide](./content-agent-guide.md).

## Content concepts

- **Artifact:** A durable published object: an essay, note, image set, audio piece, video, link, experiment, or reference. Its Markdown/MDX body is the main content.
- **Sphere:** A thematic territory that can contain many artifacts and can nest beneath another sphere. A sphere is broader than a tag.
- **Path (internal collection: Trail):** A curated, ordered route through artifacts and spheres. Its body is optional introductory editorial text.
- **Page:** A singleton or utility page such as About, Now, Colophon, or Contact.

## IDs and relationships

Every entry has a required `slug` in frontmatter. That explicit value is the collection entry ID and the only identifier used in relationships. Published slugs are immutable: move or rename a file freely, but do not change its slug without a future redirect plan.

Artifacts list sphere and related-artifact slugs. Spheres optionally name a parent sphere slug. Trails name sphere slugs and ordered targets with a `kind` and `slug`. The build validates all of these references and stops with a clear error when a target is missing.

## Adding an artifact

Create a `.md` or `.mdx` file anywhere under `src/content/artifacts/`. The folder is for human organization only; `type` controls behavior. Give the entry a unique, lowercase hyphenated `slug`.

```yaml
---
slug: machine-at-the-edge-of-the-garden
title: Machine at the Edge of the Garden
type: essay
status: published
summary: A meditation on cultivated land and the instruments used to observe it.
publishedAt: "2026-07-20"
spheres: [old-internet]
tags: [ecology, machines]
layout: feature
hero:
  kind: image
  src: /media/images/machine-garden.jpg
  alt: A machine standing at the edge of a garden
---
```

```yaml
---
slug: field-recording-01
title: Field Recording 01: Irrigation at Dusk
type: audio
status: published
summary: Water valves, insects, and a distant cooling fan.
publishedAt: "2026-07-19"
spheres: [field-images]
tags: [audio, field-recording]
media:
  - kind: audio
    src: /media/audio/field-recording-01.mp3
    duration: "03:18"
---
```

```yaml
---
slug: slow-orbit
title: Slow Orbit
type: experiment
status: published
summary: A small MDX notebook about returning to an idea slowly.
publishedAt: "2026-07-21"
spheres: [independent-systems]
tags: [experiment, mdx]
layout: experiment
---
```

## Spheres and trails

```yaml
---
slug: old-internet
title: Old Internet
status: published
summary: Small, slow, personal corners of the web.
palette: dusk
order: 20
---
```

```yaml
---
slug: ways-of-entering
title: Ways of Entering
status: published
summary: A gentle route into AstroSphere.
items:
  - kind: artifact
    slug: machine-at-the-edge-of-the-garden
    note: Begin with the tension between landscape and machine.
  - kind: sphere
    slug: old-internet
---
```

## Media

Store managed images and large galleries under `MEDIA_ROOT/images/<topic>/` and reference them with root-relative paths such as `/media/images/<topic>/example.webp`. Manga and doujinshi reader media belongs under `MEDIA_ROOT/manga/`. Astro serves both namespaces during development; never duplicate these files under `public/`. Small repository-owned audio or video may continue using the established `public/media/audio/` and `public/media/video/` locations. Put captions, credits, dimensions, playback settings, and other metadata in the artifact frontmatter media object—not in page components.

The same `src` and `poster` fields accept HTTPS URLs. Moving media to object storage later only changes those values; it does not require a schema or relationship migration.

## Drafts and future migration

Use `status: draft` for work in progress. Published helpers return only `status: published`; archived entries are also excluded by default.

A future CMS can preserve this model by storing the same frontmatter fields and Markdown/MDX body, retaining every explicit slug. A future media service can retain the media object shape and substitute HTTPS object-storage URLs for managed root-relative paths.
