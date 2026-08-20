# Shelf Routing and Pagination Design

## Goal

Make The Shelf a personal, curated landing page while providing complete, fast-to-navigate, JavaScript-free archives for manga, doujinshi, and image sets.

## URL structure

| Purpose | URL |
| --- | --- |
| Curated Shelf landing page | `/shelf` |
| Manga archive, first page | `/shelf/manga` |
| Manga archive, subsequent pages | `/shelf/manga/page/2`, `/shelf/manga/page/3`, … |
| Doujinshi archive, first page | `/shelf/doujinshi` |
| Doujinshi archive, subsequent pages | `/shelf/doujinshi/page/2`, `/shelf/doujinshi/page/3`, … |
| Image-set archive, first page | `/shelf/image-sets` |
| Image-set archive, subsequent pages | `/shelf/image-sets/page/2`, `/shelf/image-sets/page/3`, … |
| Legacy Manga URL | `/manga` permanently redirects (301) to `/shelf` |

The existing `/image-sets` route will permanently redirect to `/shelf/image-sets` so image-set browsing has one canonical home under The Shelf. New internal navigation, breadcrumbs, sidebars, and Shelf links use the `/shelf` URLs.

## Curated Shelf landing page

`/shelf` is an editorial landing page, not a complete archive. It shows three sections—Manga, Doujinshi, and Image sets—with up to six explicitly selected entries per section. Its initial configuration contains six Manga entries, five Doujinshi entries, and the two currently published Image sets.

The selections are stored as ordered content slugs in a dedicated Shelf configuration module. This keeps the selection personal and stable: newly imported or published content never changes the landing page until it is intentionally added to the configuration. The data layer resolves each configured slug against the relevant published collection, preserving the configured order and safely omitting a missing, draft, or unpublished entry.

Each section finishes with an ordinary “Browse all” anchor to its archive. Existing card components continue to render entries and retain the SFW behavior for explicit content.

## Static pagination

Each category archive uses Astro static pagination with 24 entries per page. Categories are filtered before pagination:

- Manga includes published series whose format is not `doujinshi`.
- Doujinshi includes published series whose format is `doujinshi`.
- Image sets include published image-set entries.

Astro generates every page at build time. The first archive page has the clean category URL; only later pages use `/page/<number>`. There are no query parameters, endpoint requests, client state, infinite scrolling, or client-side filtering.

A shared pagination component receives Astro’s pagination data and renders a labelled `<nav>`. It includes:

- a page status such as “Page 2 of 9”;
- Previous and Next links when a neighboring page exists;
- a compact page-number window containing the first page, last page, current page, and nearby pages, with ellipses for omitted ranges;
- `aria-current="page"` on the current page and meaningful accessible names for all controls.

All controls are ordinary anchors. The component has visible keyboard focus styles and uses the established accent, border, and muted design tokens rather than introducing a new pagination color system.

## Redirects and canonical URLs

The legacy `/manga` page returns a permanent redirect to `/shelf`. The existing `/image-sets` page returns a permanent redirect to `/shelf/image-sets`. Redirect pages must not duplicate archive content. Canonical URLs are supplied by the destination pages through the existing layout behavior.

Manga series and chapter detail URLs stay unchanged under `/manga/<slug>` because they describe individual reading material rather than the Shelf index. Manga-series sidebars link to `/shelf/manga`; image-set detail breadcrumbs and sidebars link to `/shelf` and `/shelf/image-sets`.

## Error handling

Only page numbers produced by Astro’s static pagination exist. Invalid page numbers, malformed route values, and removed categories resolve through the site’s normal static 404 behavior. Missing curated slugs are ignored rather than causing a build failure, keeping content publication resilient; their absence is visible through the reduced curated count and can be corrected in Shelf configuration.

## Testing and verification

Tests cover route presence, permanent redirects, native Astro pagination usage, category filters, the fixed page size, explicit curation configuration, and the absence of client-side filtering or JavaScript pagination code. Component source tests cover accessible pagination markup and ordinary anchors.

Build verification confirms the generated first and later archive-page paths, redirects, and no-JavaScript markup. Existing manga, image-set, sidebar, breadcrumb, and publishing-guard tests must remain green.

## Constraints

- Keep the experience server-rendered and JavaScript-free.
- Preserve existing external media-root handling and root-relative media URLs.
- Preserve existing explicit-content/SFW behavior.
- Do not change individual manga or chapter detail URL paths.
- Do not modify Git state unless explicitly requested.
