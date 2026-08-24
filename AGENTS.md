## Efficiency policy

- Read and follow `docs/agent-efficiency-policy.md` before choosing a workflow.
- Use one agent and direct execution for routine and bounded work. Never recommend subagent-driven development; use subagents only after the user explicitly requests delegation and is warned about its usage cost.
- Do not create specs, plans, ledgers, review packages, branches, or worktrees for routine content/media/documentation tasks.
- Run focused verification while working and broad verification at most once when justified. Never repeat a passing check against unchanged files.
- When the user reports low remaining usage, immediately drop optional research, delegation, independent reviews, and broad test loops; finish through the shortest safe path.

## Development

- For routine content and media work, follow `docs/agent-workflows.md` and use the shortest existing command. Do not create subagents, branches, implementation plans, or new infrastructure unless explicitly requested.
- Work directly on the main branch unless explicitly told otherwise.
- Do not run Git commands or otherwise modify Git state unless explicitly requested.
- Manga creator frontmatter uses `{ name, slug }` entries for `authors` and `artists`; use the internal `/manga/creators/{slug}` pages and never paste Mangadex creator URLs into manga content.
- Before adding a manga or doujinshi entry, when practical, verify the authoritative English title for `title` and the Japanese title in romanized form for `originalTitle` using a reliable publisher, catalog, or database source. Prefer the English release title as the main title and the romanized Japanese title beneath it (for example, `Delicious in Dungeon / Dungeon Meshi`). If a reliable source cannot be found promptly, use the best available supplied title and continue; do not loop indefinitely or block the entry, and flag the title for later review when uncertainty remains.
- Doujinshi titles need more flexibility: preserve stylized, numbered, acronym-based, or untranslated titles when there is no meaningful English/Japanese distinction (for example, `3 4.5 5` in both fields). When an established translation or supplied bilingual title exists, put the English portion in `title` and the connected Japanese/romanized portion in `originalTitle` (for example, `Adventurers by Day, Secretly Training by Night` / `Nakayoshi Onna Boukensha wa Yoru ni Naru to Yadoya de Mechakucha Ecchi Suru`, or `LOVE, VIOLENCE AND SKIN.` / `Ai to Bouryoku to Skin ~Shin Teikoku Hen~`). Do not force a translation or split a title when doing so would change the identity of the doujinshi.
- Keep all heavy manga, doujinshi, and image-set binaries out of the repository. Manga and doujinshi belong under `MEDIA_ROOT/manga`; image-set galleries belong under `MEDIA_ROOT/images` (locally `/Users/astrochan/Documents/Workstation/astrosphere-media`). Keep frontmatter URLs root-relative (`/manga/...` or `/media/images/...`).
- Astro dev serves both managed URL namespaces from `MEDIA_ROOT`; never fix local media 404s by copying binaries into `public/`.
- Keep `MEDIA_ROOT/.astrosphere/` private. It contains operation records and must never be served or synchronized.
- Convert animated GIF sources to animated WebP with `bun run media:optimize`.
- Import one or more chapter-labelled manga CBZ/ZIP volumes—or a folder containing them—with `bun run media:add manga-volume <source...> --series <slug>`. Imports publish by default; add `--draft` when review is needed first.
- Import mixed doujinshi/image-set folders only through a reviewed versioned manifest: preview with `bun run media:add batch <folder> --manifest <file> --dry-run`, then rerun without `--dry-run`. Existing content may be replaced only when the manifest explicitly uses `mode: update` and `replace: true`; never weaken the collision checks.
- Create content-only drafts with `bun run content:new <essay|doujinshi|image-set> <slug>`; the command must refuse existing destinations and must never copy binaries into the repository.
- Free chapter storage without breaking published routes with `bun run media:remove manga <series> --chapter <number> --unavailable`; review the preview and type `yes` to remove the media while retaining a “Currently unavailable” entry.
- Run `bun run media:validate` before synchronization. Review `bun run media:sync -- --dry-run --prune` before any confirmed prune.
- `media:maintain` is unfinished and is not a supported public command. Do not invoke or document it as available.
- Permanently delete a complete entry only when explicitly requested: resolve exact content and external-media targets, remove/update incoming references, never use broad globs or namespace roots, then require zero `media:validate` errors/orphans and a clean `astro check`.
- For content-only changes, run focused validation once; do not repeatedly run the full test/build suite. Run the full suite when code/schema behavior changes or before an explicitly requested release.

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Trails and reading progress

- Trail order is defined by the `items` array in `src/content/trails/*.md`; never infer or reorder trail steps in a page component.
- Use `getTrailItemTargets()` and `getTrailProgressForArtifact()` from `src/lib/content.ts` to resolve trail entries and calculate the current position. Keep this work server-rendered.
- Use `src/components/TrailProgress.astro` for the visual progress indicator. It renders linked dots plus previous/next arrow links, including support for external signal entries.
- Trail progress belongs immediately after the article body, before supporting media, transcripts, or related links.
- Keep the feature JavaScript-free. Navigation must use ordinary anchors, and progress must be derived from the current page URL/content rather than client-side reading state.
- Preserve accessibility: keep the progress navigation labelled, give each dot and arrow a meaningful accessible name, use `aria-current="page"` for the current stop, and retain visible keyboard focus styles.
- Completed dots and connecting lines use `var(--color-accent)`; upcoming steps use the existing border/muted colors. Do not introduce a separate trail-progress color system.

## Artifact media deduplication

- Treat an artifact's `hero` image as its banner, `media` entries as its supporting gallery, and Markdown body images as editorial illustrations.
- Do not repeat the same image in all three places. If an image is already used by `hero` or `media`, omit it from the Markdown body unless there is a specific editorial reason to show it again in context.
- When a body image is useful, prefer a distinct asset and keep its placement tied to the surrounding text. For gallery-style essays, the media gallery should normally carry the image set while the body provides context and captions without duplicating the gallery.

## BLACKSOULS character galleries

- Character pages may include large source-faithful galleries and H-scene route documentation; optimize downloaded images into `MEDIA_ROOT/images` and keep only root-relative `/media/images/...` references in content.
- When generating raw HTML galleries in Markdown, write real line breaks—not literal `\\n` text—between `<figure>` elements. Before handoff, verify that image-reference count equals the unique-reference count, every reference has a corresponding external WebP, and `bun run astro check` passes.
