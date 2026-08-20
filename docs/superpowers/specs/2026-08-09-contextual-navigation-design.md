# Contextual navigation

## Goal

Give AstroSphere a consistent navigation model: the navbar moves between the site’s major modes, while the sidebar explains and navigates the place currently being viewed. Remove the duplicate global navigation currently split between `SiteHeader` and `SiteSidebar`.

## Global navbar

The static navbar contains only durable, high-level destinations:

- AstroSphere home (the existing logo)
- Explore (`/spheres`)
- Manga (`/manga`)
- Watchlist (external)
- Work (`/work`)
- About (`/about`)
- Search (`/search`)

Theme, CRT, and SFW controls remain in the navbar. On narrow screens, the navbar continues to expose its primary links and controls without a drawer or horizontal scrolling.

`Artifacts`, `Trails`, `Signals`, `Now`, `Contact`, `Support`, `Colophon`, and RSS do not appear as peer global navbar links. They remain discoverable through contextual sidebars and relevant page content.

## Contextual sidebar modes

The shared layout selects a sidebar mode from the current route. Page templates provide additional context only where the route needs it.

| Route group | Sidebar content |
| --- | --- |
| Home | A compact "Start exploring" list: Spheres, Trails, Artifacts, Signals, Manga, and a random-artifact link when available. |
| Archive indexes (`/spheres`, `/artifacts`, `/trails`, `/signals`) | "Explore the archive" collection menu. The current collection is active; the other three remain available. A secondary entry offers a random artifact. |
| Sphere detail | Return to all spheres; current sphere identity; child spheres; filtered links/counts for its artifacts, signals, and trails. |
| Artifact detail | Artifact type; linked spheres; tags; related artifacts. This describes the artifact’s place in the archive instead of repeating global links. |
| Trail detail | Trail index link plus an ordered list of the trail’s items. Local artifact links stay in-page; external destinations clearly retain their external behavior. |
| Manga index / series / chapter | Manga library link; series list or current series chapter list; previous/next chapter controls where applicable. The SFW control remains global in the header. |
| Studio pages (`/work`, `/contact`, `/support`) | "Work with Astro" menu: Work, Contact, Support. |
| About pages (`/about`, `/now`, `/colophon`) | "About AstroSphere" menu: About, Now, Colophon, RSS. |
| Search and not-found | A minimal recovery menu: Explore, Search, Home. |

Each sidebar has a short visible heading and one navigation landmark. Current entries use `aria-current="page"`; parent collection links are not marked current on detail pages.

## Component architecture

- Add `src/config/navigation.ts` as the source of truth for global links and static sidebar groups.
- Refactor `SiteHeader.astro` to consume the global links from that module.
- Refactor `SiteSidebar.astro` to accept a typed sidebar model: heading, optional intro, and ordered navigation groups/items.
- Extend `BaseLayout.astro` with an optional `sidebar` prop. It resolves a default mode from `Astro.url.pathname` and passes an explicitly supplied model through unchanged.
- Detail pages construct only the data-backed local pieces they own (sphere children/content links, artifact taxonomy/relations, trail items, and manga chapters) and supply them to `BaseLayout`.

This keeps route recognition centralized, prevents `SiteSidebar` from importing content, and keeps content collection queries in their existing page modules.

## Responsive behavior

Above 48rem, the sidebar remains the left column. At 48rem and below, it becomes a collapsed `details` disclosure below the navbar, titled with its contextual heading. It is closed by default to preserve reading space, keyboard accessible, and retains a 44px minimum target. The home/archive context remains immediately available when expanded; no second grid of global links is introduced.

## Scope and validation

- Do not introduce dropdowns, client-side routing state, or a new content collection.
- Preserve current paths, external-link safety, theme/CRT/SFW behavior, and focus styles.
- Add focused navigation-model tests for route selection and active-state semantics.
- Run `astro check`, the test suite, and a production build.
- Check desktop and 390px layouts for no horizontal overflow, one primary navigation landmark per navigation area, and usable touch targets.
