# Reader navigation dock

## Goal

Let readers leave or move through a long manga chapter or article without first returning to its beginning or end, while keeping the reading surface calm.

## Scope

Add a shared client-side reader dock for long-form content. It appears only after the page's primary reader header has scrolled out of view. It provides reading progress, fast jumps to the beginning and end, and access to the page's existing contextual navigation.

## Manga chapter experience

- The chapter header provides previous chapter, series/chapter-list, and next chapter controls when those destinations exist.
- The same controls are repeated after the final manga image, so a reader can continue or leave at the natural end of the chapter.
- The floating dock shows current document progress, top and end actions, and a navigation action. Its navigation action focuses/opens the existing contextual sidebar rather than creating a second site menu.
- Previous or next controls are omitted individually at the first or last chapter.

## Article experience

- Artifact and other long-form article pages receive the same dock with progress, top, end, and contextual-navigation actions.
- They do not receive manga chapter controls.
- Short pages may use the same component; the dock remains hidden until their header is out of view and therefore does not add initial visual clutter.

## Interaction and accessibility

- The dock uses native buttons with explicit labels and a 44px minimum touch target.
- Top/end actions use smooth scrolling unless the user has requested reduced motion.
- Progress is exposed as a labelled progress indicator and updates while scrolling and after client-side Astro navigations.
- The contextual-navigation action opens the mobile sidebar disclosure if present, then moves keyboard focus to its navigation landmark; on desktop it moves focus to that landmark.
- The dock must survive Astro client-side navigation without duplicate event listeners or stale references.

## Architecture

- A `ReaderDock.astro` component renders the controls and includes one focused client-side module.
- `BaseLayout.astro` opts pages into the dock through a boolean prop, leaving regular pages untouched.
- Manga route code determines neighbouring chapters and gives `MangaReader.astro` the links it needs. The reader renders identical chapter navigation at the header and footer.
- The contextual sidebar exposes stable selectors/IDs for opening and focusing its navigation without duplicating navigation data.

## Validation

- Add source-level regression tests for reader-dock rendering, accessible labels, layout opt-in, and manga previous/next controls.
- Run the focused tests, full test suite, `astro check`, and production build.
- Check a desktop viewport and a 390px viewport: no horizontal overflow, dock controls remain reachable, and the mobile sidebar can be opened from the dock.

## Non-goals

- No saved reading position, chapter auto-advance, new content collection, or duplicate global navigation menu.
- No Git branch, commit, staging, or push actions by Codex.
