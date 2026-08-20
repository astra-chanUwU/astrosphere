# Pagefind Discovery Design

AstroSphere V2 begins with static full-text discovery. Pagefind runs after Astro builds `dist`, producing static index assets with no search service or account. A dedicated `/search` page loads the index only when visited and searches published rendered pages.

The interface has a search field, visible result count, category buttons (all, essays, notes, manga, signals, spheres, trails), and sphere/tag selectors populated from Pagefind filters. Manga is indexed at the series level only. When the existing SFW setting is enabled, explicit manga is excluded from search results. `⌘K` is explicitly deferred; it will reuse this page’s search module later.

Every searchable detail page supplies Pagefind metadata and filters through `BaseLayout`. The search page itself opts out of indexing. Signal content is discoverable through its existing index page in this first release; individual signal pages are out of scope.
