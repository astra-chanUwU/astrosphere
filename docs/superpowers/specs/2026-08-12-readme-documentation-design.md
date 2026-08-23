# README documentation design

> Superseded by `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`. Retained as a historical record; do not use its commands or environment variables.

## Goal

Update `README.md` so it serves both software contributors and content editors. It should explain the repository's purpose, get a new contributor from checkout to a working local site, and point editors to the correct content and media workflows without duplicating the detailed VPS runbook.

## Scope

The README will document:

- AstroSphere's static Astro architecture and its main content areas: artifacts, spheres, trails, signals, pages, and manga.
- Prerequisites, Bun installation, environment setup, local development, the separate manga media server, and production preview/build commands.
- The useful `package.json` scripts grouped by development, content/media, validation, and deployment responsibilities.
- The content directory map and links to `docs/content-model.md` and `docs/content-agent-guide.md` for complete field definitions and authoring rules.
- The manga-specific split between repository metadata and the external `MANGA_MEDIA_ROOT`, including the creator frontmatter convention `{ name, slug }` and internal creator routes.
- The publishing/check sequence: validate external manga media, run tests and Astro checks, build the static site, and review generated output.
- The existing VPS deployment and media synchronization documentation, with no copied operational commands that could drift from `docs/deployment-vps.md`.

## README shape

Use a short overview followed by these sections:

1. Overview and content map.
2. Prerequisites and setup.
3. Local development.
4. Content authoring.
5. Manga and media storage.
6. Commands.
7. Verification checklist.
8. Deployment.

Keep command examples copyable and prefer links to maintained project documentation for detailed schemas and VPS procedures.

## Accuracy constraints

- Use Bun commands because the project scripts and test workflow are Bun-oriented.
- Keep the existing background Astro server workflow and its `astro dev status`, `astro dev logs`, and `astro dev stop` management commands.
- Do not suggest storing manga binaries under `public/manga`.
- Do not paste external MangaDex creator URLs into manga content; document the internal `/manga/creators/{slug}` route convention.
- Only document scripts that exist in `package.json`.
- Mention that `bun run build` runs Astro's static build and Pagefind indexing, while `bun run prepare:search` prepares the development search index.

## Out of scope

- Changing application code, schemas, scripts, or deployment behavior.
- Rewriting `docs/content-model.md`, `docs/content-agent-guide.md`, or `docs/deployment-vps.md`.
- Adding screenshots, badges, generated tables, or a separate contributor policy.

## Verification

After editing, inspect the rendered Markdown structure manually and run the repository's existing checks that are appropriate for a documentation-only change: `bun test`, `bunx astro check`, and `bun run build` if the local environment supports them. Confirm every command and link in the README matches the repository.
