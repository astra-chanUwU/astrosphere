# Tag Archives Design

## Goal

Make tags useful navigation: clicking a tag opens a permanent archive page containing every published artifact, manga series, and signal with that tag.

## Scope

- Generate a static page at `/tags/<tag>` for every tag used by published content.
- Link every displayed tag in artifact metadata, signal cards, manga metadata, and manga cards to its archive page.
- Include matching published content from artifacts, manga series, and signals; group it by type and omit empty groups.
- Preserve each existing content type’s visibility rule: `status: published` for artifacts and signals, and `visibility: published` for manga series.
- Unknown tag routes use the site’s ordinary 404 behavior.

## Architecture

The dynamic Astro route obtains its paths at build time from the existing published-content helpers. It selects entries whose `data.tags` contains the requested slug, then renders the existing content cards where those cards already present a suitable archive item. Small, semantic inline markup supplies any missing list treatment.

Tag links are ordinary anchor elements with root-relative `href` values. There is no client-side routing, state, fetch, or filtering required. This makes tag navigation available to readers without JavaScript, provides shareable URLs, and leaves room for a later optional enhancement without changing the baseline contract.

## Rendering

- Page heading: `Tag: <tag>`.
- Intro copy reports the total number of matching published items.
- Content sections appear in a stable order: Artifacts, Manga, Signals.
- Each section has an accessible heading and shows only if it has results.
- Existing date, summary, rating, external-link, and card behavior remain intact.

## Error Handling

Only known generated tags have routes. Astro serves its normal not-found response for any other tag URL. An empty tag is impossible through generated paths and cannot be produced by the content schema.

## Testing

Tests inspect the route and components to ensure the tag route is generated from published content, filters all three supported collections, renders grouped result sections, and that every visible tag is an ordinary link to `/tags/<tag>`. Existing test conventions use Bun’s test runner and source inspection for Astro page behavior.

## Constraints

- No JavaScript is added for tag navigation.
- No dependencies are added.
- Work directly on `main`; do not stage, commit, create branches, or otherwise change Git state.
