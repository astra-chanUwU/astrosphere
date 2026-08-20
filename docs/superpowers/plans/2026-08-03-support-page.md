# Support AstroSphere Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a static, privacy-conscious support page with safe crypto and contact placeholders.

**Architecture:** One typed configuration file owns all public support details. Placeholder values are detected before rendering, so the deployed page never presents fake payment data; the page has no wallet connection, tracking, or third-party payment code.

**Tech Stack:** Astro 7, TypeScript, static HTML and CSS.

---

### Task 1: Add safe support configuration and tests

**Files:**
- Create: `src/config/support.ts`
- Create: `tests/support-page.test.ts`

- [ ] Define wallet, contact, and supporter records with unconfigured placeholder values.
- [ ] Export `isConfiguredSupportValue()` so views never render a placeholder as an active destination.
- [ ] Assert the route uses the configuration and the configuration exports the guard.

### Task 2: Add the static support route and navigation

**Files:**
- Create: `src/pages/support.astro`
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/SiteSidebar.astro`

- [ ] Render configured wallet addresses as selectable code, otherwise a neutral unavailable state.
- [ ] Render configured contacts as links, otherwise omit them.
- [ ] Explain anonymity, consent-only public credits, and the absence of tracking.
- [ ] Add Support to site navigation.

### Task 3: Verify

**Files:**
- Test: `tests/support-page.test.ts`

- [ ] Run `bun test`, `bunx astro check`, and `bun run build`.
