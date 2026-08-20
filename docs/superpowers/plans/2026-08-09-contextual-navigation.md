# Contextual Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace duplicate global navigation with a stable major-destination navbar and page-aware sidebars.

**Architecture:** `src/config/navigation.ts` owns global links, route defaults, and sidebar types. `BaseLayout` resolves default sidebars; detail routes pass data-backed models. Rendering components query no content collections.

**Tech Stack:** Astro 7, TypeScript, scoped CSS, Bun test, Astro check.

## Global Constraints

- No dropdowns, client-side route state, or new content collections.
- Preserve paths, external-link safety, theme/CRT/SFW behavior, and focus styles.
- Navbar: home, Explore, Manga, Watchlist, Work, About, Search.
- At 48rem and below, the sidebar is a closed accessible `details` disclosure with a 44px summary target.
- Verify with `bun test`, `bunx astro check`, and `bun run build`.

---

### Task 1: Define navigation models and default route maps

**Files:**
- Create: `src/config/navigation.ts`
- Modify: `tests/sidebar.test.ts`

**Interfaces:**
- Produces: `NavItem`, `SidebarGroup`, `SidebarModel`, `primaryNavigation`, and `resolveSidebar(pathname: string): SidebarModel`.

- [ ] **Step 1: Write failing model checks**

```ts
const navigation = await Bun.file(new URL("../src/config/navigation.ts", import.meta.url)).text();
expect(navigation).toContain('label: "Explore"');
expect(navigation).toContain('label: "Watchlist"');
expect(navigation).toContain('export const resolveSidebar');
expect(navigation).toContain('heading: "Explore the archive"');
```

- [ ] **Step 2: Run `bun test tests/sidebar.test.ts`; verify it fails because the module does not exist.**

- [ ] **Step 3: Implement typed models and route defaults.**

```ts
export interface NavItem { href: string; label: string; external?: boolean; current?: boolean; }
export interface SidebarModel { heading: string; intro?: string; groups: SidebarGroup[]; }
export const resolveSidebar = (pathname: string): SidebarModel =>
  pathname === "/artifacts" ? archiveSidebar("/artifacts") : homeSidebar;
```

Include home, archive-index, studio, about, manga, and recovery modes. Mark only exact archive indexes current.

- [ ] **Step 4: Re-run `bun test tests/sidebar.test.ts`; verify it passes.**

### Task 2: Refactor shared header, layout, and sidebar rendering

**Files:**
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/SiteSidebar.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `tests/header-layout.test.ts`
- Modify: `tests/sidebar.test.ts`

**Interfaces:**
- Consumes: navigation exports from `src/config/navigation.ts`.
- Produces: `BaseLayout` prop `sidebar?: SidebarModel`; `<SiteSidebar model={resolvedSidebar} />`.

- [ ] **Step 1: Write failing contracts.**

```ts
expect(header).toContain('import { primaryNavigation }');
expect(sidebar).toContain('interface Props { model: SidebarModel; }');
expect(sidebar).toContain('<details>');
expect(layout).toContain('sidebar?: SidebarModel');
expect(layout).toContain('resolveSidebar(Astro.url.pathname)');
```

- [ ] **Step 2: Run `bun test tests/header-layout.test.ts tests/sidebar.test.ts`; verify failure.**

- [ ] **Step 3: Implement component boundary.**

```astro
<aside class="sidebar" aria-label={model.heading}>
  <details>
    <summary>{model.heading}</summary>
    <nav aria-label={model.heading}>
      {model.groups.map((group) => <ul>{group.items.map((item) => <li><a href={item.href}>{item.label}</a></li>)}</ul>)}
    </nav>
  </details>
</aside>
```

Desktop displays details content; mobile is closed by default. Preserve control IDs and Watchlist security attributes.

- [ ] **Step 4: Re-run focused tests; verify pass.**

### Task 3: Pass local archive context from detail route modules

**Files:**
- Modify: `src/pages/spheres/[slug].astro`
- Modify: `src/pages/artifacts/[slug].astro`
- Modify: `src/pages/trails/[slug].astro`
- Modify: `src/pages/manga/[slug].astro`
- Modify: `src/pages/manga/[slug]/[chapter].astro`
- Modify: `tests/sidebar.test.ts`

**Interfaces:**
- Consumes: `SidebarModel` and each route’s existing query results.
- Produces: route-specific `sidebar` props.

- [ ] **Step 1: Add failing source checks.**

```ts
expect(spherePage).toContain('sidebar={sidebar}');
expect(artifactPage).toContain('heading: "Artifact details"');
expect(trailPage).toContain('heading: "Trail contents"');
expect(mangaPage).toContain('heading: "Manga library"');
expect(readerPage).toContain('heading: series.data.title');
```

- [ ] **Step 2: Run `bun test tests/sidebar.test.ts`; verify failure.**

- [ ] **Step 3: Build and pass detail models from existing data.** Sphere includes all-spheres, children, and content links/counts; artifact includes type, spheres, tags, related artifacts; trail includes indexed items; manga includes ordered chapters and reader previous/next links.

- [ ] **Step 4: Re-run `bun test tests/sidebar.test.ts`; verify pass.**

### Task 4: Validate the complete navigation contract

**Files:**
- Modify: `tests/sidebar.test.ts`
- Modify: `tests/header-layout.test.ts`

**Interfaces:**
- Consumes: completed components and route models.
- Produces: regression tests for contextual navigation and responsive disclosure behavior.

- [ ] **Step 1: Add final behavior checks.**

```ts
expect(header).not.toContain('label: "Artifacts"');
expect(header).not.toContain('label: "Signals"');
expect(sidebar).toContain('aria-current={item.current ? "page" : undefined}');
expect(sidebar).not.toContain('overflow-x: auto');
expect(sidebar).toContain('min-height:2.75rem');
```

- [ ] **Step 2: Run `bun test && bunx astro check && bun run build`; verify all pass.**

- [ ] **Step 3: Run `astro dev --background` and inspect desktop plus 390px layouts.** Confirm section-appropriate sidebar, closed mobile sidebar, no horizontal overflow, and ≥44px targets.

- [ ] **Step 4: Commit source and test changes as `feat: add contextual site navigation`.**
