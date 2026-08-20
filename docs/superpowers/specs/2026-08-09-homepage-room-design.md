# AstroSphere Homepage Room Design

## Goal

Turn the homepage from a compact archive index into a quiet, personal entry room that helps visitors understand AstroSphere through selected objects rather than a dashboard-like overview.

## Direction

The first screen is an editorial room: a short statement of purpose, one manually selected current focus, and a small constellation of related archive objects. Visitors can then enter through a curated trail or a thematic sphere. The current focus is intentionally separate from general `featured` content so it can change with the author's attention without affecting other archive listings.

## Content model

Add `src/config/homepage.ts` containing the current focus artifact slug and up to three constellation artifact slugs. A resolver filters missing, duplicate, unpublished, and focus-duplicating slugs. Existing artifact frontmatter remains unchanged.

## Page structure

1. Introductory room statement with a restrained invitation to enter.
2. Current focus card with type, primary sphere, date, summary, and optional hero image.
3. Constellation of connected artifacts, each linked directly to its artifact page.
4. A gentle explanation of spheres and trails, followed by one featured trail and a small set of spheres.
5. A subdued random-artifact link as a secondary route.

## Constraints

- Keep the existing Astro static-first architecture and content collections.
- Do not add dependencies or a new content collection.
- Preserve responsive and keyboard-accessible navigation.
- If a configured slug is unavailable, omit it gracefully and retain useful fallback content.
- Keep manga and signals out of this first homepage pass; visitors can reach them through the existing navigation.

## Verification

- Unit-test the homepage content resolver with published, missing, duplicate, and focus-exclusion cases.
- Run the Astro type checker and production build.
