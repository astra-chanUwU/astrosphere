# Thumb-first mobile navigation

## Goal

Replace horizontal swipe navigation on screens at or below 48rem. Mobile navigation must expose its destinations without hidden overflow and prioritize actions reachable while holding a phone in the right hand.

## Layout

- Keep the compact logo and current-page title at the top.
- Render the six primary destinations as a visible two-column grid: Home, Spheres, Artifacts, Signals, Manga, and Watchlist.
- Render theme, CRT, and SFW controls as a matching three-column utility row directly below the primary grid. Controls retain their existing IDs and client-side behavior.
- Render the secondary archive links as a normal two-column list below the header rather than as a horizontal ribbon.
- Keep the existing desktop and tablet sidebar behavior above 48rem.

## Interaction and accessibility

- No hamburger, drawer, or horizontal scrolling navigation.
- All mobile navigation and utility controls have a minimum 44px target height.
- The main content has no horizontal overflow at a 390px viewport.
- Watchlist remains an external link with safe new-tab attributes.

## Validation

- Add source-level regression checks that mobile styles do not use horizontal overflow or nowrap navigation.
- Verify the layout at a 390px viewport, then run tests, Astro checks, and a production build.
