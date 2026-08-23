# AstroSphere

AstroSphere is a static Astro archive built and tested with Bun.

## Development

Install dependencies with `bun install`. Copy `.env.example` to `.env` and set `MEDIA_ROOT` to the external media directory. Its public trees are `manga/` and `images/`; `.astrosphere/` is private operation data.

Start Astro in background mode with:

```sh
astro dev --background
```

Use `astro dev status`, `astro dev logs`, and `astro dev stop` to manage the background server.

Astro serves external media through the same origin during development. Use `bun run media:serve` only when inspecting media without the website.

## Media workflow

Manga metadata belongs in `src/content/manga`. Manga, doujinshi, and image-set binaries belong under `MEDIA_ROOT`; never add them beneath `public/`.

Import one or more chapter-labelled CBZ/ZIP volumes, or pass a folder containing them. This creates optimized WebP chapters under `MEDIA_ROOT/manga` and published entries under `src/content/manga/chapters`:

```sh
bun run media:add manga-volume <source...> --series <series-slug>
```

For mixed doujinshi/image-set folders or explicit chapter replacement, use a reviewed versioned manifest. Always preview first; unlisted archives are reported and ignored:

```sh
bun run media:add batch <source-folder> --manifest <batch.yaml> --dry-run
bun run media:add batch <source-folder> --manifest <batch.yaml>
```

Batch imports are transactional per entry. Creates refuse existing destinations, updates require `mode: update` plus `replace: true`, and replaced chapter data remains recoverable under `MEDIA_ROOT/.astrosphere/quarantine/`.

Add `--draft` to review new chapters before publishing. To reclaim storage while keeping a valid published chapter page, preview and confirm:

```sh
bun run media:remove manga <series-slug> --chapter <number> --unavailable
```

For standalone archives or galleries, use the lower-level optimizer. Validate all published references before synchronization:

```sh
bun run media:optimize <source> --output <destination> --profile <reader|gallery>
bun run media:validate
```

When a VPS target is configured, preview and perform a non-deleting upload with `bun run media:sync -- --dry-run` and `bun run media:sync`. Remote pruning requires `--prune`, a reviewed manifest, and typing `yes` interactively.

The production VPS and media synchronization workflow is documented in [docs/deployment-vps.md](docs/deployment-vps.md).

Create schema-shaped content drafts without copying media:

```sh
bun run content:new essay <slug>
bun run content:new doujinshi <slug>
bun run content:new image-set <slug>
```

## Checks

```sh
bun test
bun run astro check
bun run build
```
