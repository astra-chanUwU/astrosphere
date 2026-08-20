# VPS deployment

AstroSphere targets a small Debian or Ubuntu VPS with Bun building the application and Caddy serving static output plus the external manga library.

## Server layout

```text
/srv/astrosphere/
├── app/             Git checkout
├── releases/        timestamped Astro builds
├── site -> releases/<active release>
└── media/
    ├── manga/       covers, artwork, and reader pages
    └── images/      external image-set galleries
```

Create these directories for a non-root deployment account and keep at least 2 GiB free before each build. On a 2 GB server, configure a 2–4 GB swap file so a temporary Astro/Bun memory spike does not terminate the build.

## First application checkout

Install Git, Bun, and Caddy using their official instructions. Clone the cleaned repository into `/srv/astrosphere/app`, then run:

```sh
cd /srv/astrosphere/app
bun install --frozen-lockfile
bun test
bun run build
```

The deployment command performs a fast-forward-only pull, locked install, test run, build, release copy, and atomic `site` symlink switch:

```sh
ASTROSPHERE_ROOT=/srv/astrosphere bun run deploy:vps
```

A failed pull, install, test, or build leaves the active site symlink unchanged. The newest three successful releases are retained. To roll back, point `/srv/astrosphere/site` at a known release using a temporary symlink and atomic rename.

## Media synchronization

On the computer that owns the prepared media library, configure:

```dotenv
MANGA_MEDIA_ROOT=/absolute/path/to/astrosphere-media/manga
VPS_MEDIA_TARGET=astro@example.com:/srv/astrosphere/media/manga
IMAGE_SET_MEDIA_ROOT=/absolute/path/to/astrosphere-media/images
VPS_IMAGE_SET_TARGET=astro@example.com:/srv/astrosphere/media/images
```

Preview the incremental transfer:

```sh
bun run manga:sync -- --dry-run
```

Then transfer changed and new files:

```sh
bun run manga:sync
```

Sync external image sets with the same non-destructive transfer policy:

```sh
bun run image-sets:sync
```

The sync command never deletes remote files. Publish media before deploying metadata that references it. Use WSL or another environment providing OpenSSH and rsync when preparing content on Windows.

## Caddy and DNS

Copy `ops/Caddyfile` to the server, replace `astrosphere.example.com` with the real domain, then validate before reloading:

```sh
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy serves `/manga/*` from the external media directory with immutable one-year caching and serves all other paths from the active Astro release. HTTPS is automatic when DNS points directly to the VPS.

Cloudflare's Free proxy is optional. If enabled, keep SSL mode at Full (strict) and preserve the origin cache headers. The site remains functional when Cloudflare proxying is disabled.

## Backups and monitoring

Keep an offsite backup of `/srv/astrosphere/media`; the Git repository and Cloudflare cache are not media backups. Monitor free disk space, Caddy logs, and the size of `releases/` and `media/`. Verify a backup restore periodically rather than assuming a successful upload is recoverable.
