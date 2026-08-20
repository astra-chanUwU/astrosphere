# Suckless Theme and Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle AstroSphere around suckless.org's plain, information-first visual language and add a persistent, accessible light/dark theme control.

**Architecture:** Semantic theme tokens define light and dark palettes. An inline script applies a stored preference before paint, while a small header control changes the preference at runtime. Existing content routes and components inherit the new system without data-model changes.

**Tech Stack:** Astro 7, TypeScript, CSS custom properties, vanilla browser APIs, Bun.

---

### Task 1: Define the token system

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`

- [x] Replace the warm, card-oriented defaults with high-contrast light and dark token sets, selected by `data-theme` on the root element.
- [x] Use system sans-serif typography, 1px borders, square corners, compact spacing, plain underlined links, and no decorative shadows or gradients.
- [x] Preserve reduced-motion support and visible focus styles.

### Task 2: Add persistent theme selection

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/SiteHeader.astro`

- [x] Add a blocking inline script in the document head that chooses `localStorage.theme` when valid, otherwise `prefers-color-scheme`.
- [x] Add an accessible header button that toggles between light and dark modes, updates `data-theme`, stores the choice, and announces the current action with `aria-label`.
- [x] Keep the control usable with JavaScript disabled: the OS preference still selects the palette.

### Task 3: Simplify shared chrome

**Files:**
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/SiteFooter.astro`
- Modify: `src/styles/global.css`

- [x] Make navigation a compact text-first row with the theme control at the end.
- [x] Remove rounded, elevated, or decorative treatment from shared chrome.

### Task 4: Verify

**Files:**
- No source changes expected

- [x] Run `bunx astro check`.
- [x] Run `bun run build`.
- [x] Run the site and verify the toggle changes the document theme, persists across reloads, and both palettes keep text, links, focus states, and borders legible.
