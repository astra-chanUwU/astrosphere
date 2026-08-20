# Personal Voice Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace early concept-era static copy with a more personal, specific Astro Chan voice across the home page, identity pages, support/contact pages, footer, and metadata.

**Architecture:** Keep all existing page structure and behavior. Update the content collection Markdown for About, Colophon, and Contact, then update the small presentation/config strings in the home page, Support page, footer, and site config.

**Tech Stack:** Astro, Markdown/MDX content, TypeScript configuration.

## Global Constraints

- Keep the voice atmospheric and indirect, with Astro Chan present through framing and specific material.
- Use the approved hero copy: "A personal collection of strange kawaii lil things UwU."
- Use the approved supporting copy: "A growing pile of manga, games, images, essays, research, and other things from my orbit."
- Preserve existing support wallet, copy controls, contact-link, and supporter-list behavior.
- Do not change navigation, content schemas, layout, or unrelated page copy.
- Do not modify Git state; the repository instructions reserve Git operations for explicit requests.

---

### Task 1: Update the personal identity pages

**Files:**
- Modify: `src/content/pages/about.md`
- Modify: `src/content/pages/colophon.md`
- Modify: `src/content/pages/contact.md`

**Interfaces:**
- Consumes: Existing `pages` content collection frontmatter and Markdown rendering.
- Produces: Published About, Colophon, and Contact copy with unchanged slugs and page types.

- [ ] **Step 1: Replace About copy** with the approved personal framing, including Astro Chan, manga, games, images, art, essays, recordings, references, experiments, spheres, and trails.
- [ ] **Step 2: Replace Colophon copy** while retaining Markdown, MDX, repository, static rendering, Astro, artifacts, spheres, and trails.
- [ ] **Step 3: Replace Contact copy** so it invites hello messages, reactions, recommendations, and project discussions instead of calling itself a placeholder.
- [ ] **Step 4: Run the content/build validation** with `npm run build` and confirm the three published pages render from the collection.

### Task 2: Update shared identity and entry-point copy

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/components/SiteFooter.astro`
- Modify: `src/config/site.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `public/social-preview.svg`

**Interfaces:**
- Consumes: Existing Astro page strings, site config metadata, and social preview asset.
- Produces: Consistent Astro Chan-centered identity across browser metadata, home hero, footer, and social preview text.

- [ ] **Step 1: Replace the home hero eyebrow, headline, supporting paragraph, and page description** with the approved copy and actual site content.
- [ ] **Step 2: Replace the global home-page header title and footer description** with compact Astro Chan-centered descriptions of the existing collection.
- [ ] **Step 3: Replace `siteConfig.description`** with the same positioning for shared metadata.
- [ ] **Step 4: Update the social preview SVG description and visible subtitle** so shared previews do not retain the old generic archive language.
- [ ] **Step 5: Run `npm run build`** and inspect the generated output for the new strings.

### Task 3: Update support framing without changing support behavior

**Files:**
- Modify: `src/pages/support.astro`

**Interfaces:**
- Consumes: Existing support configuration, wallet rendering, copy controls, and supporter rendering.
- Produces: A support page that explains the personal project context while preserving all existing interactions and safety guidance.

- [ ] **Step 1: Replace the page description and opening paragraph** with copy about helping keep AstroSphere online and giving the personal work more time.
- [ ] **Step 2: Leave wallet rendering, anonymous-support language, warnings, crediting mechanics, and supporter rendering unchanged.**
- [ ] **Step 3: Run `npm run build`** and confirm support configuration still compiles.

### Task 4: Final copy consistency check

**Files:**
- Verify: `src/content/pages/about.md`
- Verify: `src/content/pages/colophon.md`
- Verify: `src/content/pages/contact.md`
- Verify: `src/pages/index.astro`
- Verify: `src/pages/support.astro`
- Verify: `src/components/SiteFooter.astro`
- Verify: `src/config/site.ts`
- Verify: `public/social-preview.svg`

- [ ] **Step 1: Search for retired phrases** such as `personal mixed-media archive`, `placeholder contact page`, `without needing to become a feed`, and `ongoing work of AstroSphere` in the affected files.
- [ ] **Step 2: Search for the approved hero and supporting copy** and confirm they appear in the intended home-page locations.
- [ ] **Step 3: Run the final production build** with `npm run build` and report the result without claiming success unless the command exits successfully.
