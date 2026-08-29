# AstroSphere design guide

This is the working visual guide for AstroSphere. It is for Astro Chan and for any agent changing the site. Preserve the character of the site before adding novelty.

## Core idea

AstroSphere is an archive, not a marketing page. The interface should help someone find the next interesting thing quickly.

- Content comes before explanation.
- A title, image, and useful metadata are stronger than decorative copy.
- Every visible section needs a job: browse, read, filter, follow, or understand what changed.
- Prefer a quiet archive structure to a hero, mosaic, carousel, or oversized promotional card.

## Page composition

Use a page-wide grid when the content benefits from a second column. The primary material normally sits on the left; the right column should contain useful navigation, related material, counts, or recent activity.

```css
grid-template-columns: minmax(0, 2fr) minmax(13rem, 1fr);
gap: clamp(2rem, 6vw, 6rem);
```

Collapse to one column below `48rem`. Do not leave a visually empty column. If there is no useful secondary content, use a single readable column instead.

## Surfaces and color

- Light page: `#ffffff`.
- Dark page: `#000000`.
- Light header/logo strip: `--color-header-surface` (`#e9e9e9`).
- Dark header/logo strip: `--color-header-surface` (`#1b1b1b`).
- Shared cards and controls use `--color-surface`; do not change it just to tune the header.
- Use `--color-border` for quiet structure and `--color-accent` for links and active signals.
- Do not introduce gradients, glass effects, shadows, or a new color system without a strong content reason.

## Typography

- Sans-serif is the default reading face.
- Serif treatment is reserved for important titles and editorial headings.
- Mono is for labels, dates, counts, status, and navigation metadata.
- Keep headings direct: `Manga`, `Image sets`, `Dispatches`, `Explore`.
- Avoid slogans and explanatory filler such as “A place for things that deserve a second look.”

## Cards and archive rows

Use the existing card components before creating a new card style:

- `MangaSeriesCard` for manga and doujinshi.
- `ImageSetCard` for image sets.
- `ArtifactCard` for artifacts.
- `SphereCard` for thematic territories.
- `TrailCard` for connected paths.

Cards should have a visible image when one exists, a consistent media column, a clear title, and only useful metadata. Keep borders horizontal and light. Avoid double rules and avoid repeating the same label in adjacent components.

## Navigation

Top-level destinations are direct and descriptive: Explore, Manga, Doujinshi, Image sets, Work, About. Collection pages should link directly to their own canonical route. Older URLs may remain as compatibility routes, but they should not be the primary language of the interface.

## Homepage

The homepage is a two-column archive feed:

- Left: curated manga, recent image sets, and doujinshi.
- Right: dated `Dispatches` describing actual archive activity.
- Use “Current attention” for a small present-tense index.
- Do not add a hero, manifesto, or generic welcome block.

## Explore

Explore is the entry point to the archive’s thematic layer. It should connect Spheres, Artifacts, Paths, and Signals. The page can be denser than the homepage, but it should still use the same two-column archive grid and direct labels.

## Agent checklist

Before changing a page, ask:

1. What content is this page helping someone reach?
2. What is the purpose of each column and section?
3. Can an existing component or token do this already?
4. Is any copy explaining the site instead of presenting content?
5. Does the change work in both themes and at mobile width?

Run a focused test for the changed route, then one `bun run astro check` before handoff.
