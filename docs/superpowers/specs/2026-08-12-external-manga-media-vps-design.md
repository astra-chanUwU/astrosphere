# External Manga Media and VPS Deployment Design

## Goal

Remove manga binaries from the Astro application repository and its Git history while preserving the existing manga content model and reading URLs. Prepare the application for a small VPS where Bun builds the site, Caddy serves the generated site and a separate media tree, and Cloudflare's free proxy/CDN can optionally cache public responses.

## Scope

This migration covers:

- external storage of manga covers, artwork, and reader pages;
- one configurable manga asset URL boundary;
- local preparation and validation on macOS or Windows;
- incremental media synchronization to the VPS;
- Bun-based application builds on the VPS;
- Caddy static serving and cache headers;
- removal of `public/manga` from current source control;
- preservation of commit history while removing manga binaries from every historical commit.

It does not add a browser-based admin interface, MinIO, an S3 API, user accounts, database-backed metadata, or automatic media deletion.

## Architecture

The application repository and manga media library become independent deployable units:

```text
Local computer
├── astrosphere/                 Git repository
│   ├── src/
│   ├── scripts/
│   ├── tests/
│   └── public/                  small application assets only
└── astrosphere-media/
    └── manga/                   covers, artwork, and reader pages

VPS
├── /srv/astrosphere/app/        lean Git checkout
├── /srv/astrosphere/releases/   versioned Astro builds
├── /srv/astrosphere/site        symlink to the active release
└── /srv/astrosphere/media/
    └── manga/                   synchronized media library
```

Bun installs dependencies, runs checks, and builds Astro on the VPS. Caddy serves `/srv/astrosphere/site` as the website and maps requests under `/manga/*` to `/srv/astrosphere/media/manga/*`. Cloudflare may proxy the domain on its Free plan but is not required for correctness.

## Repository and Media Boundaries

The Git repository retains:

- manga series and chapter frontmatter;
- page counts, dimensions, extensions, and relative media paths;
- import, sanitization, validation, synchronization, and deployment tooling;
- tests and server configuration templates;
- small non-manga assets under `public/`.

The external media tree contains all files currently under `public/manga`. Its directory layout remains unchanged below the `manga` directory. For example:

```text
public/manga/murcielago/volume-001/001.webp
```

becomes:

```text
astrosphere-media/manga/murcielago/volume-001/001.webp
```

The public URL remains:

```text
/manga/murcielago/volume-001/001.webp
```

This stability avoids bulk frontmatter changes and preserves published reader URLs.

## Configuration

Two settings define the boundary:

- `MANGA_MEDIA_ROOT`: filesystem directory containing the external `manga` tree. Local tools and publishing validation use it. On the VPS it is `/srv/astrosphere/media/manga`.
- `PUBLIC_MANGA_ASSET_BASE_URL`: optional browser-visible base URL. Production defaults to `/manga`; local development may use `http://localhost:4322/manga` when a separate local media server is running.

An `.env.example` documents both variables without committing machine-specific paths. Production builds remain valid without `MANGA_MEDIA_ROOT`, because the built pages reference media but do not copy it. A dedicated manga-media validation command requires `MANGA_MEDIA_ROOT` and checks the external files before content is published or synchronized.

## Application Components

### Manga asset URL resolver

A focused helper in `src/lib/manga-assets.ts` owns manga URL resolution. It accepts an existing root-relative manga path and replaces only the `/manga` prefix when a non-default base URL is configured. It rejects malformed input rather than rewriting unrelated media paths.

Reader page URLs, series covers, series artwork, and homepage manga covers use this helper. Internal page-navigation URLs such as `/manga/{series}/{chapter}` remain application routes and are never rewritten.

### Content model

Manga frontmatter continues to store root-relative paths. `pagePath`, cover `src`, and artwork `src` retain their current values. The content schema remains host-independent and portable.

### Import and sanitization tools

The MangaDex importer writes new manga files beneath `MANGA_MEDIA_ROOT`. It fails before downloading when that variable is absent or invalid. It continues writing metadata into the repository and continues producing internal creator links through `{ name, slug }` frontmatter entries.

The sanitizer continues accepting an explicit filesystem path. Documentation and examples point to the external media tree rather than `public/manga`.

### Publishing guard

Publishing validation resolves references by namespace:

- `/manga/*` is checked beneath `MANGA_MEDIA_ROOT`;
- every other root-relative asset is checked beneath `public/`;
- HTTPS assets continue to bypass local-file validation.

The normal production publishing guard validates repository-owned assets and skips external manga-file existence checks. A dedicated manga-media validation command enables those checks. When that command runs without a configured media root, it returns one clear configuration issue instead of reporting thousands of individual missing files. When the root is configured, missing files retain their precise source and field information.

### Local media server

A small Bun script serves `MANGA_MEDIA_ROOT` for local development. It serves files only, prevents traversal outside the configured root, returns useful `404` responses, and adds development-safe CORS and cache headers. The normal Astro development server remains responsible for application pages.

The local workflow runs the media server and Astro development server as separate managed processes. No symlink is placed inside `public/`, preventing an accidental multi-gigabyte production build.

## Deployment Flow

### Application deployment

The VPS application deployment script performs these steps:

1. update the lean application checkout;
2. install locked dependencies with Bun;
3. run tests and repository-owned asset validation without reading or downloading the media tree;
4. build Astro into a new timestamped release directory;
5. atomically switch `/srv/astrosphere/site` to that release;
6. reload Caddy only when its configuration changed;
7. retain a small number of previous releases for rollback.

A failed install, test, or build leaves the active release untouched.

### Media synchronization

A local script uses incremental `rsync` over SSH to copy `astrosphere-media/manga/` to `/srv/astrosphere/media/manga/`. The default command does not use `--delete`; stale remote media therefore survives until a deliberate cleanup operation is reviewed. A dry-run mode shows proposed transfers before sending data.

Application deployment and media synchronization remain separate. New content is synchronized before metadata referencing it is deployed.

### Caddy

Caddy serves the active site release and the external manga tree from the same origin. Manga responses receive a long public cache lifetime and `immutable` only because published manga filenames are treated as immutable. Corrections use a new filename or an explicit Cloudflare/browser cache purge.

The origin remains functional when Cloudflare is disabled. Cloudflare proxying is an optional DNS-layer deployment choice, not an application dependency.

## Capacity and Operations

The target VPS has 1 vCPU, 2 GB RAM, and 60 GB SSD storage. Static serving fits comfortably within those resources. Bun/Astro builds are the peak-memory operation, so the VPS should have a small swap file and build monitoring. At least 10 GB remains reserved for the operating system, logs, temporary build data, and release rollback.

Media disk usage is monitored independently. The deployment reports available space before media synchronization and application builds. The media tree is backed up off the VPS; neither Git history nor Cloudflare cache is considered a media backup.

## Migration Safety

The working media library is never deleted as the first migration action. The sequence is:

1. add and test the new code boundary;
2. copy `public/manga` to the external media directory;
3. compare file count and total byte size between source and destination;
4. validate all published manga references against the external copy;
5. build the application without manga beneath `public/`;
6. ensure a second recoverable media copy exists;
7. remove `public/manga` from the working tree and add it to `.gitignore`;
8. verify tests and the production build again;
9. audit large Git objects and paths;
10. rewrite history only after the application migration is complete.

## Git History Rewrite

The rewrite preserves commits while removing `public/manga/**` from all reachable history using `git filter-repo`. Generated directories such as `dist`, `.astro`, and `public/pagefind` are audited and removed from history if they were ever committed.

Before rewriting:

- the media library has at least two verified copies;
- the current remote URL and branch are recorded;
- an untouched backup clone or bundle is created outside the repository;
- the set of paths to remove is reviewed;
- local uncommitted work is absent or safely preserved.

The rewrite is first performed in a disposable mirror clone. Repository size, branch contents, tags, and absence of manga blobs are verified there. Only then is the rewritten `main` branch and applicable tags force-pushed. Existing local clones must be replaced or carefully reset because old object IDs are incompatible with rewritten history.

The original working repository is not garbage-collected until the cleaned remote and a fresh clone have been verified. This keeps rollback possible during the migration.

## Error Handling

- Missing `MANGA_MEDIA_ROOT` during import or explicit asset validation produces one actionable configuration error.
- Invalid manga paths and traversal attempts are rejected.
- Missing source media aborts synchronization before metadata deployment.
- Insufficient VPS disk space aborts before transfer or build.
- Failed builds do not replace the active release.
- Media synchronization does not delete remote files by default.
- History rewriting occurs only in a disposable clone with a verified backup.

## Testing and Acceptance Criteria

Automated tests verify:

- default and configured manga asset URL resolution;
- rejection of non-manga or malformed paths;
- reader page, cover, artwork, and homepage URL generation;
- publishing validation against both `public/` and `MANGA_MEDIA_ROOT`;
- concise behavior when the external media root is absent;
- importer destination configuration;
- local media-server traversal protection and missing-file responses;
- deployment and synchronization script dry-run behavior where practical;
- a complete production build with no `public/manga` directory.

The migration is accepted when:

- all manga pages resolve through the configured asset boundary;
- local development can display external manga media;
- the production build excludes manga binaries;
- the external copy matches the original file count and byte size;
- the VPS design can serve site and media from the same public URLs;
- a fresh clone of the rewritten repository contains no historical manga blobs and is small enough for routine GitHub operations;
- the verified external media copies remain intact after Git cleanup.
