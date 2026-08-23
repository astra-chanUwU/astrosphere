# External Manga Media and VPS Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove manga binaries from the application repository and Git history while preserving manga URLs, adding an external local/VPS media workflow, and preparing Bun-built Astro releases served by Caddy.

**Architecture:** Manga metadata stays in Astro content collections while all files formerly under `public/manga` live in an external `manga` tree. A pure URL resolver changes browser asset origins, a namespaced publishing validator checks the correct filesystem root, Bun scripts serve/sync/deploy, and Caddy maps `/manga/*` to the VPS media directory. Git history is rewritten only after two verified media copies and a verified disposable rewrite.

**Tech Stack:** Astro 7, TypeScript, Bun, Bun test, rsync over SSH, Caddy, Git, git-filter-repo

## Global Constraints

- Work directly on `main`; do not create a feature branch.
- Manga creator frontmatter remains `{ name, slug }`; creator links remain internal `/manga/creators/{slug}` URLs.
- Keep existing public manga URLs under `/manga/*` unchanged.
- Do not place a symlink to the external manga tree beneath `public/`.
- Media synchronization must not delete remote files by default.
- Do not remove the original media tree until a byte-count/file-count match and a second recoverable copy have been verified.
- Do not rewrite or force-push Git history until the application migration passes all tests and a backup bundle exists.
- Start Astro development with `astro dev --background` and manage it with Astro's background-server commands.

---

## File Structure

### Create

- `src/lib/manga-assets.ts`: pure browser URL resolver for manga assets.
- `src/lib/manga-media-root.ts`: filesystem-root parsing and manga-path resolution shared by tools and validation.
- `src/lib/manga-media-server.ts`: traversal-safe request-to-file mapping for local media serving.
- `scripts/serve-manga.ts`: Bun static media server for local development.
- `scripts/validate-manga-media.ts`: cross-platform wrapper that enables external-media validation during an Astro build.
- `scripts/sync-manga.ts`: dry-run-first, non-deleting rsync wrapper.
- `scripts/deploy-vps.ts`: Bun release builder and atomic release switcher for the VPS.
- `ops/Caddyfile`: same-origin site and manga static-file configuration.
- `.env.example`: documented local and production media configuration.
- `docs/deployment-vps.md`: local preparation, media sync, VPS layout, Caddy, and recovery instructions.
- `tests/manga-assets.test.ts`: URL resolver coverage.
- `tests/manga-media-root.test.ts`: filesystem resolution coverage.
- `tests/manga-media-server.test.ts`: request safety coverage.
- `tests/vps-deployment.test.ts`: static safety assertions for sync/deploy/Caddy configuration.

### Modify

- `src/lib/manga-reader.ts`: resolve page URLs through the manga asset helper.
- `src/components/MangaReader.astro`: pass the configured public media base.
- `src/components/MangaArtGallery.astro`: resolve image and full-size artwork URLs.
- `src/components/MangaSeriesCard.astro`: resolve series covers.
- `src/pages/manga/[slug].astro`: resolve the series hero cover.
- `src/pages/index.astro`: resolve homepage manga covers.
- `src/lib/publishing-guard.ts`: route repository and external media references to separate roots.
- `src/lib/content.ts`: choose normal versus explicit external-media validation.
- `package.json`: add media serve, validation, sync, and VPS deployment commands.
- `.gitignore`: ignore `public/manga/` and local media configuration.
- `README.md`: point contributors to the external-media and VPS guide.
- existing manga and publishing tests: preserve reader behavior and verify build integration.

---

### Task 1: Centralize Manga Asset URLs

**Files:**
- Create: `src/lib/manga-assets.ts`
- Create: `tests/manga-assets.test.ts`
- Modify: `src/lib/manga-reader.ts`
- Modify: `tests/manga-reader.test.ts`

**Interfaces:**
- Produces: `resolveMangaAssetUrl(source: string, baseUrl?: string): string`
- Produces: `createMangaPageSrc(pagePath: string, page: number, extension?: string, baseUrl?: string): string`

- [ ] **Step 1: Write failing URL resolver tests**

```ts
import { expect, test } from "bun:test";
import { resolveMangaAssetUrl } from "../src/lib/manga-assets";

test("keeps same-origin manga URLs by default", () => {
  expect(resolveMangaAssetUrl("/manga/example/chapter-001/001.webp")).toBe("/manga/example/chapter-001/001.webp");
});

test("moves manga assets to a configured development origin", () => {
  expect(resolveMangaAssetUrl("/manga/example/cover.webp", "http://localhost:4322/manga/"))
    .toBe("http://localhost:4322/manga/example/cover.webp");
});

test("preserves explicit HTTPS manga assets", () => {
  expect(resolveMangaAssetUrl("https://media.example.test/manga/example/cover.webp", "/manga"))
    .toBe("https://media.example.test/manga/example/cover.webp");
});

test("rejects unrelated root-relative paths", () => {
  expect(() => resolveMangaAssetUrl("/media/example.webp", "/manga")).toThrow("Expected a /manga asset path");
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `bun test tests/manga-assets.test.ts`

Expected: FAIL because `src/lib/manga-assets.ts` does not exist.

- [ ] **Step 3: Implement the pure resolver**

```ts
const MANGA_PREFIX = "/manga";

const normalizeBaseUrl = (baseUrl: string) => {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized || (normalized !== MANGA_PREFIX && !normalized.startsWith("https://") && !normalized.startsWith("http://localhost:"))) {
    throw new Error("Manga asset base URL must be /manga, HTTPS, or localhost HTTP.");
  }
  return normalized;
};

export const resolveMangaAssetUrl = (source: string, baseUrl = MANGA_PREFIX) => {
  if (source.startsWith("https://")) return source;
  if (source !== MANGA_PREFIX && !source.startsWith(`${MANGA_PREFIX}/`)) {
    throw new Error(`Expected a /manga asset path, received "${source}".`);
  }
  return `${normalizeBaseUrl(baseUrl)}${source.slice(MANGA_PREFIX.length)}`;
};
```

- [ ] **Step 4: Route reader page URLs through the resolver**

Change `createMangaPageSrc` to accept a final optional `baseUrl` and resolve the completed page path:

```ts
export const createMangaPageSrc = (pagePath: string, page: number, extension = "jpg", baseUrl?: string) =>
  resolveMangaAssetUrl(`${pagePath}/${String(page).padStart(3, "0")}.${extension}`, baseUrl);
```

Add a reader test expecting `http://localhost:4322/manga/example/chapter-001/001.webp` when the base URL is supplied.

- [ ] **Step 5: Run focused tests**

Run: `bun test tests/manga-assets.test.ts tests/manga-reader.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the resolver**

```bash
git add src/lib/manga-assets.ts src/lib/manga-reader.ts tests/manga-assets.test.ts tests/manga-reader.test.ts
git commit -m "feat: centralize manga asset URLs"
```

### Task 2: Apply the Asset Boundary to Every Manga Image

**Files:**
- Modify: `src/components/MangaReader.astro`
- Modify: `src/components/MangaArtGallery.astro`
- Modify: `src/components/MangaSeriesCard.astro`
- Modify: `src/pages/manga/[slug].astro`
- Modify: `src/pages/index.astro`
- Modify: `tests/manga-reader.test.ts`
- Create: `tests/manga-asset-rendering.test.ts`

**Interfaces:**
- Consumes: `resolveMangaAssetUrl(source, import.meta.env.PUBLIC_MANGA_ASSET_BASE_URL)`
- Consumes: `createMangaPageSrc(pagePath, page, extension, baseUrl)`

- [ ] **Step 1: Write source-level integration tests**

The test reads each Astro file and asserts it imports `resolveMangaAssetUrl`, uses `PUBLIC_MANGA_ASSET_BASE_URL`, and resolves image `src` plus artwork full-size `href`. Extend the reader test to assert `createMangaPageSrc` receives the configured base URL.

- [ ] **Step 2: Run the integration tests and confirm they fail**

Run: `bun test tests/manga-asset-rendering.test.ts tests/manga-reader.test.ts`

Expected: FAIL because components still render frontmatter paths directly.

- [ ] **Step 3: Resolve reader, cover, and artwork URLs**

In each Astro component/page, read:

```ts
const mangaAssetBaseUrl = import.meta.env.PUBLIC_MANGA_ASSET_BASE_URL;
```

Resolve only manga media values:

```astro
<img src={resolveMangaAssetUrl(series.data.cover.src, mangaAssetBaseUrl)} ... />
```

For gallery artwork, calculate one resolved URL per item and use it for both `<img src>` and the full-size link. For reader pages, pass `mangaAssetBaseUrl` as the fourth `createMangaPageSrc` argument.

- [ ] **Step 4: Run focused and full tests**

Run: `bun test tests/manga-asset-rendering.test.ts tests/manga-reader.test.ts`

Run: `bun test`

Expected: PASS.

- [ ] **Step 5: Commit rendering integration**

```bash
git add src/components/MangaReader.astro src/components/MangaArtGallery.astro src/components/MangaSeriesCard.astro 'src/pages/manga/[slug].astro' src/pages/index.astro tests/manga-asset-rendering.test.ts tests/manga-reader.test.ts
git commit -m "feat: resolve external manga media"
```

### Task 3: Separate Repository and Manga Filesystem Validation

**Files:**
- Create: `src/lib/manga-media-root.ts`
- Create: `tests/manga-media-root.test.ts`
- Modify: `src/lib/publishing-guard.ts`
- Modify: `src/lib/content.ts`
- Modify: `tests/publishing-guard.test.ts`
- Create: `scripts/validate-manga-media.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `requireMangaMediaRoot(value?: string): string`
- Produces: `resolveMangaMediaFile(source: string, root: string): string`
- Extends: `validatePublishingAssetReferences(references, options)` where options include `publicRoot`, `mangaRoot`, `validateManga`, and injectable `accessFile`.

- [ ] **Step 1: Write failing root and namespace tests**

Cover absolute-root validation, `/manga` prefix removal, traversal rejection, normal `/media` lookup beneath `publicRoot`, skipped manga checks during ordinary builds, one configuration issue during explicit validation without a root, and precise missing-file issues with a root.

The concise configuration issue must equal:

```ts
{
  source: "configuration",
  field: "MANGA_MEDIA_ROOT",
  message: "set MANGA_MEDIA_ROOT to validate external manga files",
}
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `bun test tests/manga-media-root.test.ts tests/publishing-guard.test.ts`

Expected: FAIL because validation has no external media namespace.

- [ ] **Step 3: Implement traversal-safe filesystem mapping**

Use `node:path` `isAbsolute`, `relative`, and `resolve`. Accept only `/manga` paths, resolve the suffix beneath the configured root, and reject a result whose relative path is `..` or starts with `../` (or the platform separator equivalent).

- [ ] **Step 4: Add explicit external-media validation mode**

The normal `assertPublishingGuardrails()` call validates files under `public/` and skips `/manga/*` existence checks. When `process.env.MANGA_VALIDATE_EXTERNAL === "1"`, it requires `MANGA_MEDIA_ROOT` and validates every manga reference against that root.

Create a cross-platform wrapper:

```ts
const child = Bun.spawn(["bun", "x", "astro", "build"], {
  cwd: import.meta.dir.replace(/\/scripts$/, ""),
  env: { ...Bun.env, MANGA_VALIDATE_EXTERNAL: "1" },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
process.exit(await child.exited);
```

Add `"manga:validate": "bun scripts/validate-manga-media.ts"`.

- [ ] **Step 5: Run tests and both validation modes**

Run: `bun test tests/manga-media-root.test.ts tests/publishing-guard.test.ts`

Run without an external root: `bun run build`

Expected: PASS and no manga files copied into `dist` once Task 7 completes.

Run without a root: `bun run manga:validate`

Expected: FAIL once with the `MANGA_MEDIA_ROOT` configuration message.

- [ ] **Step 6: Commit validation separation**

```bash
git add src/lib/manga-media-root.ts src/lib/publishing-guard.ts src/lib/content.ts scripts/validate-manga-media.ts package.json tests/manga-media-root.test.ts tests/publishing-guard.test.ts
git commit -m "feat: validate external manga media"
```

### Task 5: Add a Safe Local Bun Media Server

**Files:**
- Create: `src/lib/manga-media-server.ts`
- Create: `scripts/serve-manga.ts`
- Create: `tests/manga-media-server.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `resolveMangaMediaRequestPath(pathname: string, root: string): string | undefined`
- Produces: `contentTypeForMangaFile(pathname: string): string`
- Adds command: `bun run manga:serve`

- [ ] **Step 1: Write failing request-safety tests**

Test valid nested image requests, URL-decoded traversal (`%2e%2e`), direct `../`, requests outside `/manga/`, supported image MIME types, and unknown extensions.

- [ ] **Step 2: Run tests and confirm they fail**

Run: `bun test tests/manga-media-server.test.ts`

Expected: FAIL because the server helper does not exist.

- [ ] **Step 3: Implement the pure mapping helper and Bun server**

The Bun server binds to `127.0.0.1` by default, uses `MANGA_MEDIA_PORT` or `4322`, requires `MANGA_MEDIA_ROOT`, serves only regular files resolved by the helper, and returns `400`, `404`, or `405` as appropriate. Successful responses include `Access-Control-Allow-Origin: *` and a short development cache lifetime.

- [ ] **Step 4: Add the package command and run tests**

Add `"manga:serve": "bun scripts/serve-manga.ts"`.

Run: `bun test tests/manga-media-server.test.ts`

Expected: PASS.

- [ ] **Step 5: Smoke-test with the external media root**

Run `bun run manga:serve`, request one known cover with `curl -I`, then stop the server. Do not start Astro yet.

Expected: HTTP 200 with the correct image content type.

- [ ] **Step 6: Commit the local server**

```bash
git add src/lib/manga-media-server.ts scripts/serve-manga.ts tests/manga-media-server.test.ts package.json
git commit -m "feat: serve external manga media locally"
```

### Task 6: Add Bun VPS Deployment, Media Sync, and Caddy Configuration

**Files:**
- Create: `scripts/sync-manga.ts`
- Create: `scripts/deploy-vps.ts`
- Create: `ops/Caddyfile`
- Create: `docs/deployment-vps.md`
- Create: `tests/vps-deployment.test.ts`
- Modify: `package.json`

**Interfaces:**
- Adds command: `bun run manga:sync -- --dry-run`
- Adds command: `bun run deploy:vps`
- Requires sync env: `MANGA_MEDIA_ROOT`, `VPS_MEDIA_TARGET`
- Requires deploy env on VPS: `ASTROSPHERE_ROOT`, defaulting to `/srv/astrosphere`

- [ ] **Step 1: Write failing operational-safety tests**

Read the generated scripts and Caddyfile as text. Assert that:

- media sync includes `--archive`, `--partial`, and `--human-readable`;
- default media sync does not include `--delete`;
- dry-run is forwarded only when requested;
- deployment runs `bun install --frozen-lockfile`, `bun test`, and `bun run build`;
- active releases switch through a temporary symlink plus rename;
- Caddy serves `/manga/*` from `/srv/astrosphere/media/manga`;
- Caddy serves the application from `/srv/astrosphere/site`;
- manga responses receive a one-year immutable cache header.

- [ ] **Step 2: Run the operational tests and confirm they fail**

Run: `bun test tests/vps-deployment.test.ts`

Expected: FAIL because operational files do not exist.

- [ ] **Step 3: Implement non-deleting incremental sync**

The Bun script validates an absolute source root and a destination shaped like `user@host:/absolute/path`. It checks local source readability, prints the exact source and destination, and invokes:

```text
rsync --archive --partial --human-readable --progress SOURCE/ TARGET/
```

It adds `--dry-run` only when the CLI flag is supplied. It never constructs or accepts a delete mode.

- [ ] **Step 4: Implement atomic VPS releases**

The deploy script verifies it is running inside `/srv/astrosphere/app`, checks free space, runs locked install/tests/build, copies `dist` into a timestamped directory under `releases`, creates `site.next`, and renames that symlink to `site`. Keep the newest three release directories and remove only older directories resolved beneath the exact releases root.

- [ ] **Step 5: Add the Caddy configuration**

Use this routing shape, replacing the domain during VPS provisioning:

```caddyfile
astrosphere.example.com {
  handle_path /manga/* {
    root * /srv/astrosphere/media/manga
    header Cache-Control "public, max-age=31536000, immutable"
    file_server
  }

  handle {
    root * /srv/astrosphere/site
    encode zstd gzip
    file_server
  }
}
```

- [ ] **Step 6: Document provisioning and recovery**

Document Bun installation, Caddy installation, a 2–4 GB swap file, directory ownership, DNS/optional Cloudflare proxying, first clone, media dry-run/sync, deployment, Caddy validation, rollback by switching `site`, disk monitoring, and offsite backup expectations.

- [ ] **Step 7: Run tests and script dry-runs**

Run: `bun test tests/vps-deployment.test.ts`

Run with a deliberately missing source: `MANGA_MEDIA_ROOT=/does/not/exist VPS_MEDIA_TARGET=user@example:/srv/astrosphere/media/manga bun run manga:sync -- --dry-run`

Expected: tests PASS; sync exits before invoking rsync with a clear missing-root error.

- [ ] **Step 8: Commit VPS operations**

```bash
git add scripts/sync-manga.ts scripts/deploy-vps.ts ops/Caddyfile docs/deployment-vps.md tests/vps-deployment.test.ts package.json
git commit -m "feat: add Bun VPS deployment workflow"
```

### Task 7: Copy and Verify the External Media Library

**Files:**
- External create: `/Users/astrochan/Documents/Workstation/astrosphere-media/manga/**`
- Modify: `.gitignore`
- Remove only after verification: `public/manga/**`

**Interfaces:**
- Provides local `MANGA_MEDIA_ROOT=/Users/astrochan/Documents/Workstation/astrosphere-media/manga`

- [ ] **Step 1: Record the source inventory without modifying files**

Run file count, total byte size, and a sorted SHA-256 manifest for `public/manga`. Save the manifest outside the Git repository beside the external media directory.

- [ ] **Step 2: Copy rather than move the media tree**

Create the exact sibling media directory and use archive-preserving copy/rsync from `public/manga/` to `astrosphere-media/manga/`. This write is outside the repository and requires explicit filesystem approval in the execution environment.

- [ ] **Step 3: Verify the copy**

Generate the destination count, byte size, and SHA-256 manifest. Require equal file counts, equal total bytes, and an empty manifest diff before continuing.

- [ ] **Step 4: Validate all manga references against the copy**

Run:

```bash
MANGA_MEDIA_ROOT=/Users/astrochan/Documents/Workstation/astrosphere-media/manga bun run manga:validate
```

Expected: PASS.

- [ ] **Step 5: Create a second recoverable copy**

Confirm either an existing backup contains the verified manifest or copy the external tree to a separately mounted disk. Record the backup location in a local, uncommitted operator note.

- [ ] **Step 6: Add the repository exclusion before removal**

Add `public/manga/` to `.gitignore`. Run `git check-ignore public/manga/example` and confirm it is ignored.

- [ ] **Step 7: Remove the repository copy only after an explicit deletion checkpoint**

Reconfirm the source path is exactly `/Users/astrochan/Documents/Workstation/astrosphere/public/manga`, the external copy still matches the manifest, and the backup is reachable. Then remove only the repository copy.

- [ ] **Step 8: Verify application behavior without repository media**

Run: `bun test`

Run: `bun run build`

Run: `du -sh dist public .git`

Expected: tests and build PASS; `dist` no longer contains the multi-gigabyte manga tree; `public` is small. `.git` remains large until Task 9.

- [ ] **Step 9: Start local services and smoke-test one series**

Start `bun run manga:serve`, then start Astro with `astro dev --background`. Open one series cover, one artwork image, and one reader chapter. Stop both background services after verification.

- [ ] **Step 10: Commit the working-tree migration**

```bash
git add .gitignore public/manga
git commit -m "chore: move manga media outside Git"
```

### Task 8: Full Verification Before History Rewrite

**Files:**
- Modify only if failures reveal defects in Task 1–7 files.

- [ ] **Step 1: Run the complete test suite**

Run: `bun test`

Expected: PASS with zero failures.

- [ ] **Step 2: Run external-media validation**

Run with the verified external root: `bun run manga:validate`

Expected: PASS.

- [ ] **Step 3: Run the production build without repository manga files**

Run: `bun run build`

Expected: PASS; `find dist/manga -type f` finds no external manga binary tree.

- [ ] **Step 4: Confirm repository and external boundaries**

Verify no regular files exist beneath `public/manga`, every manga frontmatter path still begins `/manga/`, the external manifest is unchanged, and `git status --short` is clean.

- [ ] **Step 5: Commit any narrowly scoped verification fixes**

Use a specific commit message matching the defect; do not squash unrelated user work.

### Task 9: Rewrite Git History in a Disposable Clone

**Files/State:**
- Create outside repository: timestamped Git bundle backup.
- Create in a temporary directory: disposable mirror clone.
- Rewrite: historical Git object IDs for `main` and reviewed tags.

**Interfaces:**
- Removes historical paths: `public/manga/**`
- Also removes `dist/**`, `.astro/**`, and `public/pagefind/**` only if the pre-rewrite audit proves they were committed.

- [ ] **Step 1: Audit refs and historical large paths read-only**

Run `git status --short`, record the remote URL, list local/remote branches and tags, run `git filter-repo --analyze` or equivalent object-size analysis, and write the exact removal-path list. Stop if the worktree is dirty or unexpected large paths require a design decision.

- [ ] **Step 2: Create and verify an untouched bundle backup**

Create a timestamped `git bundle --all` outside the repository, run `git bundle verify`, and record its SHA-256 checksum and location. Do not garbage-collect the active repository.

- [ ] **Step 3: Create a disposable mirror clone from the active repository**

Use `mktemp -d`, clone with `--mirror`, and confirm its `main` commit matches the active repository before filtering.

- [ ] **Step 4: Run the reviewed filter in the disposable mirror**

The baseline command is:

```bash
git filter-repo --path public/manga --invert-paths --force
```

Add separate `--path` arguments for generated directories only when the audit in Step 1 showed historical blobs there.

- [ ] **Step 5: Verify the rewritten mirror before any push**

Confirm:

- `main` retains source, metadata, tests, docs, and non-manga public assets;
- `git log --all -- public/manga` returns no commits;
- object analysis contains no `public/manga` blobs;
- a normal clone from the rewritten mirror builds and tests;
- repository object size is dramatically below the original ~5.1 GB.

- [ ] **Step 6: Obtain the final force-push checkpoint**

Present the backup location/checksum, old and new `main` IDs, old and new object sizes, exact refs to update, and fresh-clone test results. Do not push until the user explicitly approves this irreversible remote update.

- [ ] **Step 7: Force-push only reviewed refs**

Update `refs/heads/main` explicitly rather than using `--mirror`. Update tags only when they were included in the reviewed rewrite. Never delete unrelated remote branches.

- [ ] **Step 8: Verify GitHub through a fresh clone**

Clone the remote into a new temporary directory, run object-size checks, verify absence of historical manga paths, install with Bun, run tests, and run the production build.

- [ ] **Step 9: Align the active local repository**

Run the identical filter on the clean active repository or replace it with the verified fresh clone. Restore the recorded remote if `git filter-repo` removed it, fetch, and confirm local `main` exactly matches remote `main`.

- [ ] **Step 10: Garbage-collect only after remote and local verification**

Expire old reflogs and run aggressive garbage collection only in the cleaned active repository. Keep the external media copies and bundle backup. Report final `.git` size and recovery instructions.

---

## Final Acceptance Run

- [ ] `bun test` passes in a fresh clone.
- [ ] `bun run build` passes without `public/manga`.
- [ ] `bun run manga:validate` passes with the external media root.
- [ ] Local Bun media serving and Astro reader smoke tests pass.
- [ ] The external media manifest matches the pre-migration source manifest.
- [ ] The VPS sync command defaults to non-deleting dry-run behavior when requested.
- [ ] Caddy validates the site/media routing configuration before production enablement.
- [ ] GitHub accepts routine clone/fetch/push operations for the rewritten repository.
- [ ] No manga binary exists in current or historical Git objects.
- [ ] At least two recoverable media copies and the pre-rewrite Git bundle remain available.
