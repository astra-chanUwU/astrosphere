# Thumb-first Mobile Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mobile swipe ribbons with visible, right-thumb-friendly navigation and utilities.

**Architecture:** The header owns the primary six links and existing preference controls; its mobile CSS changes those rows into fixed grids. The sidebar remains the secondary archive map and becomes a visible two-column list below the header on phones. Desktop and tablet styles remain unchanged.

**Tech Stack:** Astro components, scoped CSS, Bun test, Astro check.

## Global Constraints

- No hamburger, drawer, or horizontal scrolling navigation at or below 48rem.
- Keep the existing theme, CRT, and SFW element IDs and behavior.
- Every mobile destination and control uses a minimum 44px target height.
- Watchlist remains an external safe new-tab link.

---

### Task 1: Guard the mobile navigation contract

**Files:**
- Modify: `tests/sidebar.test.ts`
- Modify: `tests/header-layout.test.ts`

**Interfaces:**
- Consumes: mobile CSS in `SiteHeader.astro` and `SiteSidebar.astro`.
- Produces: source-level checks against swipeable mobile navigation.

- [ ] **Step 1: Write the failing checks**

```ts
expect(header).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
expect(header).not.toContain("overflow-x:auto");
expect(sidebar).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
expect(sidebar).not.toContain("flex-wrap: nowrap");
```

- [ ] **Step 2: Run the focused tests**

Run: `bun test tests/header-layout.test.ts tests/sidebar.test.ts`

Expected: FAIL because the existing mobile rules use horizontal overflow and nowrap.

- [ ] **Step 3: Implement the smallest CSS change to satisfy the checks**

Replace mobile flex/overflow rules with visible grid rules while preserving the desktop styles outside the 48rem media query.

- [ ] **Step 4: Run the focused tests again**

Run: `bun test tests/header-layout.test.ts tests/sidebar.test.ts`

Expected: PASS.

### Task 2: Implement and validate the thumb-first phone layout

**Files:**
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/SiteSidebar.astro`

**Interfaces:**
- Consumes: the existing links arrays and preference button IDs.
- Produces: a two-column primary navigation grid, three-column utility grid, and secondary archive grid at 48rem and below.

- [ ] **Step 1: Replace the header mobile ribbon styles**

```css
nav { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
.appearance-controls { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }
nav a,.theme-toggle,.crt-toggle,.sfw-toggle { min-height:2.75rem; }
```

- [ ] **Step 2: Replace the sidebar mobile ribbon styles**

```css
ul { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
a { min-height:2.75rem; white-space:normal; }
```

- [ ] **Step 3: Verify at a 390px viewport**

Check that the page has no horizontal overflow, the six primary links are visible, the three utilities are visible, and all navigation targets are at least 44px tall.

- [ ] **Step 4: Run complete verification**

Run: `bun test && bunx astro check && bun run build`

Expected: tests pass, Astro reports zero diagnostics, and the static build succeeds.
