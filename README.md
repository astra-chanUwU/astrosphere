# AstroSphere

AstroSphere is a static Astro archive built and tested with Bun.

## Development

Install dependencies with `bun install`. Copy `.env.example` to `.env` and set `MANGA_MEDIA_ROOT` to the external manga media directory.

Start the local manga media server with:

```sh
bun run manga:serve
```

Start Astro in background mode with:

```sh
astro dev --background
```

Use `astro dev status`, `astro dev logs`, and `astro dev stop` to manage the background server.

## Manga storage

Manga metadata belongs in `src/content/manga`. Manga covers, artwork, and reader pages belong in the external directory configured by `MANGA_MEDIA_ROOT`; never add manga binaries beneath `public/manga`.

Validate metadata and every external manga file with:

```sh
bun run manga:validate
```

The production VPS and media synchronization workflow is documented in [docs/deployment-vps.md](docs/deployment-vps.md).

## Checks

```sh
bun test
bunx astro check
bun run build
```
