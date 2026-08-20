# 2 Texas x Exusiai Publication Implementation Plan

> **For agentic workers:** Execute this plan inline using the established manga content workflow.

**Goal:** Publish the 2 Texas x Exusiai doujinshi with sanitized metadata and a complete local reader asset sequence.

**Architecture:** Add one manga series entry and one chapter entry under `src/content/manga`, then copy and zero-pad the local JPG pages into `public/manga/2-texas-x-exusiai`. Use page 1 as the cover and preserve the supplied artist as an internal creator slug.

**Tech Stack:** Astro content collections, Markdown frontmatter, static public image assets, Bun, Astro check.

## Global Constraints

- Work directly on the main branch.
- Do not run Git commands or modify Git state.
- Use `{ name, slug }` entries for manga creators.
- Remove numeric metadata IDs from tags and credits.
- Use the actual local page count and dimensions.

---

### Task 1: Publish metadata and reader assets

**Files:**
- Create: `src/content/manga/series/2-texas-x-exusiai.md`
- Create: `src/content/manga/chapters/2-texas-x-exusiai-chapter-001.md`
- Create: `public/manga/2-texas-x-exusiai/cover.jpg`
- Create: `public/manga/2-texas-x-exusiai/chapter-001/001.jpg` through `040.jpg`

**Implementation:**

- Series title: `2 Texas x Exusiai`
- Original title: `2 Texas x Exusiai`
- Format: `doujinshi`
- Origin: `fanwork`
- Rating: `explicit`
- Status: `completed`
- Publication year: `2026`
- Artist: `{ name: kataokasan, slug: kataokasan }`
- Author: `{ name: Unknown, slug: unknown }`
- Tags: `arknights`, `exusiai`, `texas`, plus all supplied sanitized content tags, `english`, and `translated`.
- Chapter page count: `40`; page extension: `jpg`; reading direction: `rtl`.
- Exclude `.DS_Store`; use source page 1 as the cover.

**Verification:**

Run `bun run astro check` and confirm zero errors, warnings, and hints. Confirm exactly 40 normalized chapter JPGs exist.
