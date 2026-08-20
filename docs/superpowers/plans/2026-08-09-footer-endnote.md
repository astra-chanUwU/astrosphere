# Footer Endnote Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the footer into a compact global endnote and remove unneeded sidebar briefing copy.

**Architecture:** `SiteFooter` remains a route-independent component fed only by its existing support configuration. `navigation.ts` stops defining sidebar introductions, and `SiteSidebar` stops rendering the optional intro field.

**Tech Stack:** Astro 7, TypeScript, scoped CSS, Bun test, Astro check.

## Global Constraints

- Footer contains identity, year, RSS, Contact, Support, and configured social links only.
- Footer contains no archive links, About, Now, Colophon, or wallet address.
- Sidebars contain headings and links only; no briefing copy.
- Preserve focus styles and external-link safety.
- Verify with `bun test`, `bunx astro check`, and `bun run build`.

---

### Task 1: Lock the quiet-footer and terse-sidebar contract

**Files:**
- Modify: `tests/sidebar.test.ts`
- Modify: `tests/support-page.test.ts`

**Interfaces:**
- Consumes: source text for `src/components/SiteSidebar.astro`, `src/config/navigation.ts`, and `src/components/SiteFooter.astro`.
- Produces: regression coverage for removed sidebar intros and a minimal footer link set.

- [ ] **Step 1: Write failing tests.**

```ts
expect(navigation).not.toContain("intro:");
expect(sidebar).not.toContain('class="intro"');
expect(footer).toContain('href="/rss.xml"');
expect(footer).toContain('href="/contact"');
expect(footer).toContain('href="/support"');
expect(footer).not.toContain('href="/trails"');
expect(footer).not.toContain('href="/now"');
expect(footer).not.toContain('bitcoin');
```

- [ ] **Step 2: Run `bun test tests/sidebar.test.ts tests/support-page.test.ts`; verify failure because sidebar intros and redundant footer content still exist.**

- [ ] **Step 3: Run the focused tests after implementation; verify pass.**

### Task 2: Remove sidebar briefing copy

**Files:**
- Modify: `src/config/navigation.ts`
- Modify: `src/components/SiteSidebar.astro`

**Interfaces:**
- Consumes: the existing `SidebarModel` groups and headings.
- Produces: a sidebar model with only `heading` and `groups`, and a sidebar renderer with no intro markup or styles.

- [ ] **Step 1: Remove `intro?: string` from `SidebarModel` and each `intro` object property.**

- [ ] **Step 2: Remove conditional intro markup and `.intro` CSS from `SiteSidebar.astro`.**

- [ ] **Step 3: Run `bun test tests/sidebar.test.ts`; verify pass.**

### Task 3: Render the footer as an endnote

**Files:**
- Modify: `src/components/SiteFooter.astro`
- Modify: `tests/support-page.test.ts`

**Interfaces:**
- Consumes: `supportConfig.contacts`, `isConfiguredSupportValue`, and the current year.
- Produces: an identity block plus a utility/social-link block; no wallet lookup or archive/meta route links.

- [ ] **Step 1: Remove the Bitcoin lookup and its markup.**

- [ ] **Step 2: Render only the allowed utility links.**

```astro
<div class="utilities">
  <a href="/rss.xml">RSS</a>
  <a href="/contact">Contact</a>
  <a href="/support">Support</a>
  {socials.map((social) => <a href={contactHref(social)}>{social.label}</a>)}
</div>
```

- [ ] **Step 3: Keep the desktop two-region layout and stack it below 35rem.**

- [ ] **Step 4: Run `bun test tests/support-page.test.ts`; verify pass.**

### Task 4: Verify the completed endnote

**Files:**
- Modify: `tests/sidebar.test.ts`
- Modify: `tests/support-page.test.ts`

**Interfaces:**
- Consumes: completed sidebar and footer sources.
- Produces: permanent protection against duplicate footer navigation and sidebar briefing copy.

- [ ] **Step 1: Run `bun test && bunx astro check && bun run build`; verify zero test failures, zero Astro diagnostics, and a successful production build.**

- [ ] **Step 2: Inspect generated home-page HTML and confirm it has sidebar headings with no briefings, and footer identity plus only RSS, Contact, Support, and social links.**
