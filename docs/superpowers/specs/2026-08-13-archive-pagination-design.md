# Archive Pagination and Row-Card Design

## Goal

Make the Artifacts and Trails indexes easier to browse as their collections grow by replacing their two-column layouts with single-column row archives and static, JavaScript-free pagination.

## URL structure

| Purpose | URL |
| --- | --- |
| Artifacts, first page | `/artifacts` |
| Artifacts, later pages | `/artifacts/page/2`, `/artifacts/page/3`, … |
| Trails, first page | `/trails` |
| Trails, later pages | `/trails/page/2`, `/trails/page/3`, … |

The current first-page URLs remain canonical. Astro generates only valid page numbers at build time, so invalid or removed pages use the existing static 404 behavior. Individual artifact and trail detail URLs remain unchanged.

## Static pagination

Artifacts and Trails each show 24 entries per page. Both archives use the existing Shelf pagination component and its ordinary HTML anchors, preserving one consistent navigation pattern across collection indexes.

The control is server-rendered and includes page status, previous/next links when available, a compact first/current/nearby/last page range, meaningful accessible names, `aria-current="page"`, and visible keyboard focus styles. It introduces no pagination JavaScript, client-side filtering, query state, or infinite scrolling.

First-page routes load their complete ordered collection, slice the first 24 entries, and give the shared archive rendering page-one metadata. Dynamic later-page routes use Astro `paginate()` and omit the generated page-one path so URLs remain clean.

## Artifacts archive

`/artifacts` becomes a uniform single-column archive. The large featured hero, random-action panel, type toolbar, and two-column grid are removed. No artifact is promoted above, duplicated in, or excluded from the paginated sequence.

Artifact ordering remains newest published date first, as returned by `getPublishedArtifacts()`. Each artifact row contains:

- its artifact type;
- linked title;
- summary;
- publication date.

The existing `ArtifactCard` becomes the row-card component for the archive and continues to support artifacts shown in tag, sphere, and related-content contexts.

## Trails archive

`/trails` becomes a uniform single-column route archive. The page retains its concise introduction and total-route count, but replaces the two-column cards with rows.

Trail ordering remains featured trails first, followed by title order. Each row contains:

- its sequence number within the full ordered trail collection;
- featured-route or route label;
- estimated time when supplied;
- stop count;
- linked title and summary;
- associated sphere names;
- ordinary “Follow a route” link.

The number stays globally meaningful: page two begins at 25 rather than restarting at 01.

## Components and data flow

A small `ArchivePagination` component wraps the existing Shelf pagination behavior or replaces it with a shared neutral name if that produces clearer ownership. It accepts the collection category/base path and Astro pagination metadata, then renders ordinary anchors only.

Artifact and Trail row cards stay separate because their metadata has different semantics. The archive routes own collection retrieval, sort order, page slicing, and the page offset needed for Trail sequence numbers. They pass only the already-paginated items and display metadata to the row components.

## Testing and verification

Tests cover first-page and later-page route generation, fixed page size, valid later-page filtering, both row-card shapes, ordinary pagination anchors, and lack of pagination scripts. The fragile archive-index test that synchronously launches its own Astro build is replaced with stable source-level route assertions and one explicit build verification command.

Verification runs affected component and route tests, the full relevant regression group, `astro check`, and a production build. Generated output must include first pages for both archives and later page directories whenever a collection exceeds 24 entries.

## Constraints

- Keep pagination server-rendered and JavaScript-free.
- Keep first-page archive URLs canonical and detail URLs unchanged.
- Keep existing TrailProgress behavior and detail-page breadcrumbs/sidebar links unchanged.
- Preserve existing content ordering before applying pagination.
- Do not modify Git state unless explicitly requested.
