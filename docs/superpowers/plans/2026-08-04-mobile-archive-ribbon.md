# Mobile Archive Ribbon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AstroSphere comfortable on phones without a hamburger menu, while preserving the Suckless-inspired desktop layout.

**Architecture:** Desktop keeps its left archive sidebar. At 48rem and below the sidebar becomes a non-wrapping horizontal archive ribbon, while the header’s primary navigation and preference controls become independently scrollable rows. Tablet retains the desktop rail until the same breakpoint, with touch-safe spacing.

**Tech Stack:** Astro 7, scoped CSS, Bun tests.

## Global Constraints

- No hamburger menu, drawer, or JavaScript navigation state.
- Mobile archive navigation is visible and horizontally scrollable, never wrapped.
- The archive ribbon is normal-flow, not sticky.
- Keep all existing desktop links and controls reachable.

---

### Task 1: Mobile navigation behavior

**Files:**
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/SiteSidebar.astro`
- Modify: `src/styles/global.css`
- Test: `tests/sidebar.test.ts`

- [ ] Add a regression assertion that the sidebar mobile rule uses `overflow-x: auto` and `flex-wrap: nowrap`.
- [ ] Run `bun test tests/sidebar.test.ts` and confirm the new assertion fails.
- [ ] At `max-width: 48rem`, make the header navigation and appearance controls scroll horizontally without wrapping; make the archive sidebar a horizontal normal-flow ribbon with visible current-page state.
- [ ] Preserve the two-column desktop rail above 48rem.
- [ ] Run `bun test tests/sidebar.test.ts` and confirm it passes.

### Task 2: Touch and reading layout

**Files:**
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/SiteSidebar.astro`
- Modify: `src/styles/global.css`
- Modify: `src/components/MangaReader.astro`

- [ ] At `max-width: 48rem`, give links and preference buttons a 2.75rem minimum touch height.
- [ ] Keep the brand row compact, allow the current page title to wrap, and prevent horizontal document overflow.
- [ ] Reduce phone gutters to `var(--space-2)` while keeping prose readable.
- [ ] Keep manga pages full-width in vertical reading mode, with no horizontal scrolling.

### Task 3: Verification

**Files:**
- Test: `tests/sidebar.test.ts`

- [ ] Run `bun test`.
- [ ] Run `bunx astro check`.
- [ ] Run `bun run build`.
- [ ] Confirm no production route fails during static generation.
