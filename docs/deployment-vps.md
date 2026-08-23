# VPS deployment

AstroSphere targets a small Debian or Ubuntu VPS with Caddy serving a locally built static site and an external media library.

## Server layout

```text
/srv/astrosphere/
├── releases/        uploaded static builds
├── site -> releases/<active release>
└── media/
    ├── manga/       manga and doujinshi media
    ├── images/      image-set galleries
    └── .astrosphere/ private synchronization records
```

Create these directories for a non-root deployment account. Keep an offsite media backup and enough free space for both the active site and a new release.

## Local configuration

The computer that owns the media library uses:

```dotenv
MEDIA_ROOT=/absolute/path/to/astrosphere-media
MEDIA_PORT=4322
MEDIA_SYNC_TARGET=astro@example.com:/srv/astrosphere/media
```

Validate media before every transfer:

```sh
bun run media:validate
bun run media:sync -- --dry-run
bun run media:sync
```

Standard synchronization uploads new and changed files incrementally and never deletes remote files. It excludes `MEDIA_ROOT/.astrosphere/`.

To inspect files that exist remotely but not locally, run:

```sh
bun run media:sync -- --dry-run --prune
```

Review the manifest carefully. A real prune uses `bun run media:sync -- --prune`, rechecks the snapshot, and requires typing `yes`. Removed files are staged in the remote private operations directory and restored automatically if a move fails.

## Website releases

Website deployment is intentionally separate from media synchronization and is not automated in this phase. Build and test locally, upload `dist/` into a new timestamped directory under `/srv/astrosphere/releases/`, then switch `/srv/astrosphere/site` atomically after verifying the upload:

```sh
bun install --frozen-lockfile
bun test
bun run astro check
bun run build
```

The VPS does not need a Git checkout or a site build. To roll back, atomically point `/srv/astrosphere/site` at a previously verified release.

## Caddy and DNS

Copy `ops/Caddyfile` to the server, replace `astrosphere.example.com`, and validate it before reloading Caddy:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy serves `/manga/*` and `/media/images/*` from the external media tree with immutable caching, then serves the active static release. HTTPS is automatic when DNS points to the VPS.

## Backups and monitoring

The repository and CDN cache are not media backups. Monitor free disk space, Caddy logs, and the sizes of `releases/` and `media/`; periodically verify that the offsite backup can be restored.
