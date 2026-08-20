# Manga Reader Design

## Scope

Build a static-first manga library, series page, and vertical chapter reader for AstroSphere. Begin with *Majo to Kyurasu / Witches and Cigarettes*, chapter 1. Do not add a paged reader, user accounts, server state, or access control.

## Routes

- `/manga` lists published series.
- `/manga/[slug]` presents series metadata and a chapter list.
- `/manga/[slug]/[chapter]` renders a chapter as one vertical sequence.

## Reading experience

The reader has a compact utility bar with a return link, series title, chapter title, and page count. Images render in numeric filename order from `001.jpg` through `pageCount`, centered in one column and full-width on narrow screens. The first image may load eagerly; subsequent images load lazily. Every image has declared `width="1440"` and `height="2048"` to prevent layout shift.

## Discovery and ratings

The existing SFW preference defaults to on and hides `explicit` series from the `/manga` index. It is a convenience filter only. Direct series and reader URLs remain valid. When SFW is on and a direct route is explicit, a client-side warning appears before the series information or reader pages; an adult visitor may deliberately continue for the current route. The choice lasts for that browser tab only.

## Components

- `MangaSeriesCard`: title pair, cover, rating, tags, and chapter count.
- `MangaSeriesMeta`: original title, publication status, creators, tags, and description.
- `MangaChapterList`: ordered chapter links.
- `MangaContentWarning`: direct-route SFW warning and continue control.
- `MangaReader`: semantic ordered image sequence and compact reader header.

## Data flow and validation

Route generation uses published `mangaSeries` and `mangaChapters` entries. Chapters are joined to their series by stable slug and sorted numerically. Page URLs are derived as `${pagePath}/${String(page).padStart(3, "0")}.jpg`. Existing build validation continues to reject chapters with unknown series slugs.

## Accessibility and failure behavior

All controls are keyboard operable. Image alternative text identifies the series, chapter, and page number without describing artwork. Missing series or chapter params return 404 from static path generation. If JavaScript is unavailable, direct routes remain readable and the warning preference cannot be enforced; this is acceptable because it is not access control.

## Verification

Add pure tests for page URL creation, numeric chapter sorting, SFW visibility, and direct-route warning state. Run Bun tests, `bunx astro check`, and `bun run build`.
