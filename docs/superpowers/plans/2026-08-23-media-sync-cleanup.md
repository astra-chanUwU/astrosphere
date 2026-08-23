# Media Synchronization and Legacy Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add unified non-deleting media synchronization, manifest-driven confirmed pruning, and complete removal of superseded scripts, names, configuration, and documentation.

**Architecture:** Pure synchronization helpers build argument arrays and compare deterministic local/remote file inventories. Normal uploads use non-deleting rsync; prune execution uploads a reviewed manifest to the private remote operations directory and runs a fixed rollback-capable remote shell procedure that validates sizes and moves only manifest paths before permanent removal.

**Tech Stack:** Bun 1.2.20+, TypeScript 5.9, rsync/OpenSSH, POSIX shell on Debian/Ubuntu VPS, Node filesystem/readline APIs, Bun test.

**Spec:** `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`

## Global Constraints

- Standard `media:sync` never deletes remote files.
- `--prune` always validates content/media first, produces an exact manifest, displays file count and bytes, and requires interactive confirmation.
- Version one has no `--yes` or other non-interactive destructive bypass.
- Delete only manifest paths; reject unsafe/control-character filenames and stale size/path snapshots.
- Store local manifests under `MEDIA_ROOT/.astrosphere/`; never synchronize or serve that directory.
- Synchronization does not use Git, build Astro, deploy the website, or activate releases.
- Remove all legacy commands without aliases only after all unified commands pass their focused tests.
- Require the foundation, optimizer, and validator plans to be complete first.

---

### Task 1: Non-deleting synchronization primitives

**Files:**
- Create: `src/lib/media/sync.ts`
- Create: `tests/media-sync.test.ts`

**Interfaces:**
- Consumes: `requireMediaRoot()`, `requireMediaSyncTarget()`, `getMediaLayout()`, `CommandRunner`, and `runCommand()`.
- Produces: `RemoteMediaTarget`, `parseRemoteMediaTarget(value)`, `createMediaSyncCommand(options)`, `RemoteMediaFile`, `createRemoteListCommand(target)`, `parseRemoteFileList(stdout)`, and `listLocalMediaFiles(root)`.

- [ ] **Step 1: Write failing target and non-deleting command tests**

```ts
import { expect, test } from "bun:test";
import { createMediaSyncCommand, parseRemoteMediaTarget } from "../src/lib/media/sync";

test("parses the restricted remote target", () => {
  expect(parseRemoteMediaTarget("astro@example.test:/srv/astrosphere/media")).toEqual({
    login: "astro@example.test",
    root: "/srv/astrosphere/media",
    value: "astro@example.test:/srv/astrosphere/media",
  });
});

test("builds one incremental sync without deletion", () => {
  const command = createMediaSyncCommand({ root: "/Users/example/astrosphere-media", target: "astro@example.test:/srv/astrosphere/media", dryRun: true });
  expect(command).toEqual([
    "rsync", "--archive", "--human-readable", "--progress",
    "--exclude", "/.astrosphere/", "--dry-run",
    "/Users/example/astrosphere-media/", "astro@example.test:/srv/astrosphere/media/",
  ]);
  expect(command).not.toContain("--delete");
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test tests/media-sync.test.ts`

Expected: FAIL because `src/lib/media/sync.ts` does not exist.

- [ ] **Step 3: Implement target and command builders**

```ts
export type RemoteMediaTarget = { login: string; root: string; value: string };
export type RemoteMediaFile = { path: string; bytes: number };
```

Restrict login to non-whitespace `user@host` and the remote root to an absolute path containing only letters, numbers, `/`, `.`, `_`, and `-`. Normalize trailing slashes. Build rsync arguments exactly as tested, adding `--dry-run` only when requested. Do not use `--partial`; rsync's default temporary-file/rename behavior prevents an interrupted transfer from exposing an incomplete destination file.

- [ ] **Step 4: Implement deterministic inventories**

`createRemoteListCommand()` returns:

```ts
["rsync", "--recursive", "--list-only", "--out-format=%l|%n", `${target.value}/`]
```

`parseRemoteFileList()` splits each nonempty line at the first `|`, requires a nonnegative integer byte count and safe relative media path, excludes directories and `.astrosphere/`, and sorts by path. Reject NUL, CR, LF, tab, absolute, backslash, and `..` segments.

`listLocalMediaFiles()` walks only `manga/` and `images/`, never follows symlinks, returns `{path, bytes}` relative to `MEDIA_ROOT`, applies the same safe-name rule, and sorts by path.

- [ ] **Step 5: Add inventory parser/walker tests and run them**

Test remote output containing `120|manga/book/001.webp`, `40|images/set/a|b.webp`, and `.astrosphere/log`; assert the filename containing `|` is preserved and private data is excluded. Test that newline/control and traversal paths fail.

Run: `bun test tests/media-sync.test.ts`

Expected: all target, command, and inventory tests pass.

- [ ] **Step 6: Commit non-deleting sync primitives**

```bash
git add src/lib/media/sync.ts tests/media-sync.test.ts
git commit -m "feat: add unified non-deleting media sync"
```

---

### Task 2: Prune manifests and staleness checks

**Files:**
- Modify: `src/lib/media/sync.ts`
- Modify: `tests/media-sync.test.ts`

**Interfaces:**
- Consumes: local and remote inventories from Task 1.
- Produces: `PruneManifest`, `createPruneManifest(options)`, `writePruneManifest(manifest, operationsRoot)`, `assertPruneSnapshotCurrent(manifest, local, remote)`, and `formatPruneManifest(manifest)`.

- [ ] **Step 1: Write failing manifest tests**

```ts
test("manifests only remote files absent locally", () => {
  const manifest = createPruneManifest({
    target: parseRemoteMediaTarget("astro@example.test:/srv/astrosphere/media"),
    local: [{ path: "manga/book/001.webp", bytes: 10 }],
    remote: [
      { path: "manga/book/001.webp", bytes: 10 },
      { path: "images/old/a.webp", bytes: 20 },
    ],
    operationId: "11111111-1111-4111-8111-111111111111",
    generatedAt: "2026-08-23T00:00:00.000Z",
  });
  expect(manifest.files).toEqual([{ path: "images/old/a.webp", bytes: 20 }]);
  expect(manifest.totalBytes).toBe(20);
});

test("rejects stale path or size snapshots", () => {
  expect(() => assertPruneSnapshotCurrent(manifest, local, [{ path: "images/old/a.webp", bytes: 21 }]))
    .toThrow("remote media changed after the prune manifest was created");
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `bun test tests/media-sync.test.ts`

Expected: FAIL because prune-manifest functions are absent.

- [ ] **Step 3: Implement immutable JSON manifests**

```ts
export type PruneManifest = {
  version: 1;
  operationId: string;
  generatedAt: string;
  target: string;
  files: RemoteMediaFile[];
  totalBytes: number;
};
```

Create deletion entries from `remote - local` by path. A same-path local file, even with a differing size, is an upload/update and never a deletion. Write JSON atomically to `.astrosphere/prune-<generated timestamp>-<operationId>.json` using a sibling temporary file plus rename. `formatPruneManifest()` prints every path/size and the exact total.

- [ ] **Step 4: Implement staleness comparison**

Before deletion, compare the current remote entry for every manifest path against its recorded byte size and ensure no manifest path has reappeared locally. Fail before remote mutation on any difference. The actual remote script performs the same size checks again.

- [ ] **Step 5: Run sync tests**

Run: `bun test tests/media-sync.test.ts`

Expected: all manifest and staleness tests pass.

- [ ] **Step 6: Commit prune planning**

```bash
git add src/lib/media/sync.ts tests/media-sync.test.ts
git commit -m "feat: create reviewable media prune manifests"
```

---

### Task 3: Confirmed rollback-capable remote pruning

**Files:**
- Modify: `src/lib/media/sync.ts`
- Create: `tests/media-prune.test.ts`

**Interfaces:**
- Consumes: `PruneManifest`, `CommandRunner`, and parsed remote target.
- Produces: `confirmPrune(question, ask?)`, `createRemotePruneScript()`, `executePruneManifest(options)`, and `syncMedia(options)`.

- [ ] **Step 1: Write failing confirmation tests**

```ts
import { expect, test } from "bun:test";
import { confirmPrune } from "../src/lib/media/sync";

test("accepts only an explicit yes response", async () => {
  expect(await confirmPrune("Delete?", async () => "yes")).toBe(true);
  expect(await confirmPrune("Delete?", async () => "y")).toBe(false);
  expect(await confirmPrune("Delete?", async () => "")).toBe(false);
});
```

- [ ] **Step 2: Write failing remote-procedure contract tests**

Assert the generated POSIX script:

- requires absolute remote root and a UUID-shaped operation ID;
- reads the uploaded TSV manifest from `$root/.astrosphere/`;
- validates every entry before the first `mv`;
- rejects symlinks, non-regular files, size changes, absolute paths, and `..` segments;
- moves files into `$root/.astrosphere/prune-$operationId/` while recreating parents;
- tracks moved files and restores them in reverse order on a move failure;
- removes the staged tree only after every move succeeds.

- [ ] **Step 3: Run prune tests and confirm failure**

Run: `bun test tests/media-prune.test.ts`

Expected: FAIL because prune execution does not exist.

- [ ] **Step 4: Implement confirmation and manifest upload**

Default confirmation uses `node:readline/promises` and asks `Type yes to delete these remote files:`. `executePruneManifest()` writes a temporary TSV containing `<bytes>\t<path>` for each file, creates the private remote operations directory with the fixed stdin script `umask 077; mkdir -p -- "$1/.astrosphere"` invoked as `ssh <login> sh -s -- <remote-root>`, uploads the TSV with rsync to `<target>/.astrosphere/prune-<operationId>.tsv`, and removes only its owned local TSV afterward. Reject tabs/control characters before creating TSV. A directory-creation or upload failure occurs before any public media move.

- [ ] **Step 5: Implement the fixed remote transaction**

Run the fixed script through:

```ts
["ssh", target.login, "sh", "-s", "--", target.root, manifest.operationId]
```

Pipe only the repository-owned script to stdin; do not interpolate manifest paths into shell source. The remote root and UUID are restricted arguments. The script first validates the entire TSV with `stat -c %s`, then moves each file to the private staged tree. A trap restores already moved paths on error. After all moves succeed, remove the staged tree and uploaded TSV. Empty parent directories under `manga/` and `images/` may be removed with guarded `find ... -depth -type d -empty -delete`.

- [ ] **Step 6: Implement the overall sync sequence**

```ts
export type SyncMediaOptions = { root: string; target: string; dryRun: boolean; prune: boolean; runner?: CommandRunner; confirm?: typeof confirmPrune };
export declare function syncMedia(options: SyncMediaOptions): Promise<{ manifest?: PruneManifest; pruned: boolean }>;
```

Order operations as follows:

1. Run the normal non-deleting rsync command; dry-run uses rsync dry-run.
2. If `prune` is false, return.
3. List current local/remote files and create/print an in-memory manifest.
4. If dry-run, return without writing, prompting, or deleting.
5. Write the manifest atomically beneath the local operations directory.
6. If the manifest is empty, return without prompting.
7. Ask for explicit `yes`; declined confirmation returns without deletion.
8. Relist both sides and assert the snapshot is current.
9. Execute the remote manifest transaction.

- [ ] **Step 7: Run prune and sync tests**

Run: `bun test tests/media-sync.test.ts tests/media-prune.test.ts`

Expected: all tests pass with fake runners; no network connection occurs.

- [ ] **Step 8: Commit confirmed pruning**

```bash
git add src/lib/media/sync.ts tests/media-prune.test.ts
git commit -m "feat: prune remote media from reviewed manifests"
```

---

### Task 4: `media:sync` CLI integration

**Files:**
- Modify: `src/lib/media/cli.ts`
- Modify: `scripts/media.ts`
- Modify: `package.json`
- Modify: `tests/media-cli.test.ts`

**Interfaces:**
- Consumes: standalone validation pipeline and `syncMedia()`.
- Produces: `parseSyncArgs(argv): {dryRun: boolean; prune: boolean}` and `media:sync`.

- [ ] **Step 1: Add failing sync parser tests**

```ts
expect(parseSyncArgs([])).toEqual({ dryRun: false, prune: false });
expect(parseSyncArgs(["--dry-run"])).toEqual({ dryRun: true, prune: false });
expect(parseSyncArgs(["--prune", "--dry-run"])).toEqual({ dryRun: true, prune: true });
expect(() => parseSyncArgs(["--yes"])).toThrow("Unknown option: --yes");
```

Also assert the package script is exactly `"media:sync": "bun scripts/media.ts sync"`.

- [ ] **Step 2: Run CLI tests and confirm failure**

Run: `bun test tests/media-cli.test.ts`

Expected: FAIL because sync parsing/dispatch is absent.

- [ ] **Step 3: Implement validation-first sync dispatch**

Before invoking `syncMedia()`, run the same content-reference and media validation pipeline as `media:validate`. Print its report. If it contains errors, set exit code `4` and do not call rsync/ssh. Otherwise require `MEDIA_SYNC_TARGET`, run synchronization, and print whether the operation uploaded only, produced a dry-run manifest, was declined, had nothing to prune, or completed pruning. Configuration failures use exit `3`; rsync/SSH/remote transaction failures use `MediaError("synchronization", ...)` and exit `6`.

- [ ] **Step 4: Run CLI/sync tests**

Run: `bun test tests/media-cli.test.ts tests/media-sync.test.ts tests/media-prune.test.ts tests/media-validator.test.ts`

Expected: all focused tests pass.

- [ ] **Step 5: Commit sync CLI integration**

```bash
git add src/lib/media/cli.ts scripts/media.ts package.json tests/media-cli.test.ts
git commit -m "feat: expose safe media synchronization"
```

---

### Task 5: Remove legacy infrastructure and retain generic publishing guards

**Files:**
- Modify: `src/lib/publishing-guard.ts`
- Modify: `src/lib/content.ts`
- Modify: `tests/publishing-guard.test.ts`
- Create: `tests/media-legacy-removal.test.ts`
- Create: `tests/caddy-media.test.ts`
- Remove: `scripts/sanitize-manga.ts`
- Remove: `scripts/serve-manga.ts`
- Remove: `scripts/validate-manga-media.ts`
- Remove: `scripts/sync-manga.ts`
- Remove: `scripts/sync-image-sets.ts`
- Remove: `scripts/deploy-vps.ts`
- Remove: `scripts/generate-bs2-batch.mjs`
- Remove: `src/lib/manga-sanitizer.ts`
- Remove: `src/lib/manga-media-root.ts`
- Remove: `src/lib/manga-media-server.ts`
- Remove: `src/lib/image-set-media-root.ts`
- Remove: `src/lib/image-set-media-server.ts`
- Remove: `src/lib/vps-operations.ts`
- Remove: `tests/manga-sanitizer.test.ts`
- Remove: `tests/manga-media-root.test.ts`
- Remove: `tests/manga-media-server.test.ts`
- Remove: `tests/image-set-media-root.test.ts`
- Remove: `tests/image-set-media-server.test.ts`
- Remove: `tests/vps-deployment.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: all completed unified modules.
- Produces: no legacy package aliases, environment-gated external build validation, or obsolete deploy path.

- [ ] **Step 1: Write the failing legacy-removal contract**

```ts
test("active project files expose only unified media infrastructure", async () => {
  const pkg = await Bun.file(new URL("../package.json", import.meta.url)).json();
  for (const name of ["manga:sanitize", "manga:serve", "manga:sync", "image-sets:sync", "manga:validate", "deploy:vps"]) {
    expect(pkg.scripts[name]).toBeUndefined();
  }
  for (const path of ["scripts/sanitize-manga.ts", "scripts/serve-manga.ts", "scripts/deploy-vps.ts", "scripts/generate-bs2-batch.mjs"]) {
    expect(await Bun.file(new URL(`../${path}`, import.meta.url)).exists()).toBe(false);
  }
});
```

- [ ] **Step 2: Run the test and confirm it fails on legacy files**

Run: `bun test tests/media-legacy-removal.test.ts`

Expected: FAIL because legacy scripts and package aliases remain.

- [ ] **Step 3: Simplify the production-build publishing guard**

Keep `collectPublishingAssetReferences()` and generic public-file/link validation in `publishing-guard.ts`. Managed `/manga/*` and `/media/images/*` references are skipped by ordinary build validation because `media:validate` owns them. Remove `mangaRoot`, `imageSetRoot`, `validateManga`, and `validateImageSets` options and all legacy environment reads from `content.ts`. Update tests to assert ordinary build validation skips both managed namespaces but still fails for missing `public/` assets.

- [ ] **Step 4: Preserve Caddy behavior in a focused test**

Move only the Caddy assertions from `tests/vps-deployment.test.ts` into `tests/caddy-media.test.ts`. Assert `/manga/*` serves `/srv/astrosphere/media/manga`, `/media/images/*` serves `/srv/astrosphere/media/images`, both precede the site fallback, and immutable production cache headers remain.

- [ ] **Step 5: Remove all obsolete scripts, libraries, tests, and package aliases**

Delete the files listed in this task after the generic publishing guard and Caddy test pass. Remove the six legacy scripts from `package.json`; retain the four unified commands. Confirm no current TypeScript/Astro import references a deleted module with:

Run: `rg -n 'manga-media-root|image-set-media-root|manga-media-server|image-set-media-server|manga-sanitizer|vps-operations' src scripts tests astro.config.mjs`

Expected: no matches.

- [ ] **Step 6: Run legacy, publishing, and Caddy tests**

Run: `bun test tests/media-legacy-removal.test.ts tests/publishing-guard.test.ts tests/caddy-media.test.ts`

Expected: all tests pass.

- [ ] **Step 7: Commit legacy removal**

```bash
git add package.json src/lib/content.ts src/lib/publishing-guard.ts scripts src/lib tests
git commit -m "refactor: remove legacy media infrastructure"
```

---

### Task 6: Active documentation and agent-instruction migration

**Files:**
- Modify: `AGENTS.md`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/deployment-vps.md`
- Modify: `docs/BLACKSOULS-II-CONTENT-GUIDE.md`
- Modify: `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`
- Modify: replaced historical plans/specifications with superseded notices.
- Modify: `tests/media-legacy-removal.test.ts`

**Interfaces:**
- Consumes: final command/config behavior.
- Produces: one accurate operational vocabulary for humans and agents.

- [ ] **Step 1: Extend the failing active-documentation scan**

Read `AGENTS.md`, `.env.example`, `README.md`, `docs/deployment-vps.md`, and `docs/BLACKSOULS-II-CONTENT-GUIDE.md`. Assert they contain `MEDIA_ROOT`; assert active docs/config contain none of `MANGA_MEDIA_ROOT`, `IMAGE_SET_MEDIA_ROOT`, `MANGA_MEDIA_PORT`, `PUBLIC_MANGA_ASSET_BASE_URL`, `MANGA_VALIDATE_EXTERNAL`, `IMAGE_SET_VALIDATE_EXTERNAL`, `VPS_MEDIA_TARGET`, `VPS_IMAGE_SET_TARGET`, `manga:serve`, `manga:sync`, `image-sets:sync`, `manga:validate`, or `deploy:vps`.

- [ ] **Step 2: Run the contract and confirm old documentation fails it**

Run: `bun test tests/media-legacy-removal.test.ts`

Expected: FAIL with matches in active documentation/configuration.

- [ ] **Step 3: Rewrite active setup and operational guidance**

Document exactly:

```dotenv
MEDIA_ROOT=/Users/astrochan/Documents/Workstation/astrosphere-media
MEDIA_PORT=4322
MEDIA_SYNC_TARGET=astro@example.com:/srv/astrosphere/media
```

README development uses Astro’s same-origin media middleware and `astro dev --background`; standalone `bun run media:serve` is described as media-only inspection. Document optimize, validate, dry-run sync, and confirmed prune commands. State that website deployment is intentionally not implemented in this phase and will use local build/upload rather than Git pull on the VPS.

- [ ] **Step 4: Update `AGENTS.md` operational rules**

State that manga/doujinshi use `MEDIA_ROOT/manga` and `/manga/*`; image sets use `MEDIA_ROOT/images` and `/media/images/*`; `.astrosphere` is private; copying binaries into `public/` is forbidden; animated GIFs should become animated WebP through `media:optimize`; validation is required before synchronization; prune must be dry-run-reviewed and confirmed.

- [ ] **Step 5: Mark replaced historical designs clearly**

Add a notice immediately below the title of each replaced sanitizer/external-media/VPS plan or spec:

```md
> Superseded by `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`. Retained as a historical record; do not use its commands or environment variables.
```

Do not rewrite their historical bodies. Change the unified spec status to `Approved`.

Apply the notice at minimum to:

- `docs/superpowers/specs/2026-08-05-manga-sanitizer-design.md`;
- `docs/superpowers/plans/2026-08-05-manga-sanitizer.md`;
- `docs/superpowers/specs/2026-08-12-external-manga-media-vps-design.md`;
- `docs/superpowers/plans/2026-08-12-external-manga-media-vps.md`;
- `docs/superpowers/specs/2026-08-12-readme-documentation-design.md`.

- [ ] **Step 6: Migrate the ignored local environment without exposing it**

If `.env` exists, verify the configured manga and image-set roots share one parent with `manga/` and `images/` basenames. Replace them with that parent as `MEDIA_ROOT`; rename `MANGA_MEDIA_PORT` to `MEDIA_PORT`; remove `PUBLIC_MANGA_ASSET_BASE_URL`; and, only when both legacy remote targets share one parent, replace them with `MEDIA_SYNC_TARGET`. Preserve unrelated settings. Edit `.env` with `apply_patch`, never stage it, and print only variable names—not values—in verification output.

- [ ] **Step 7: Run documentation and legacy contracts**

Run: `bun test tests/media-legacy-removal.test.ts`

Expected: all active-documentation and removal assertions pass.

- [ ] **Step 8: Commit documentation migration**

```bash
git add AGENTS.md .env.example README.md docs tests/media-legacy-removal.test.ts
git commit -m "docs: adopt unified media workflow"
```

---

### Task 7: Full branch verification

**Files:**
- Modify only to fix failures caused by the approved media implementation.

**Interfaces:**
- Produces a merge-ready feature branch; does not merge it.

- [ ] **Step 1: Run every unit and contract test freshly**

Run: `bun test`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run Astro type/content validation**

Run: `bun run astro check`

Expected: zero errors, warnings, and hints.

- [ ] **Step 3: Build the complete static site and search index**

Run: `bun run build`

Expected: exit `0`; Astro and Pagefind both complete.

- [ ] **Step 4: Exercise CLI help and read-only paths**

Run:

```bash
bun scripts/media.ts --help
bun run media:optimize -- <temporary-source> --output <temporary-output> --profile reader --dry-run
MEDIA_ROOT=<temporary-media-root> bun run media:validate
```

Expected: help exits `0`; optimizer dry-run makes no output; validation returns the expected deterministic report for the temporary fixture root.

- [ ] **Step 5: Prove old names remain only in marked historical records**

Run:

```bash
rg -n 'MANGA_MEDIA_ROOT|IMAGE_SET_MEDIA_ROOT|PUBLIC_MANGA_ASSET_BASE_URL|manga:serve|manga:sync|image-sets:sync|manga:validate|deploy:vps' . --glob '!docs/superpowers/plans/**' --glob '!docs/superpowers/specs/**' --glob '!tests/media-legacy-removal.test.ts' --glob '!node_modules/**'
```

Expected: no matches.

- [ ] **Step 6: Review branch state without merging**

Run: `git status --short --branch`

Expected: clean `codex/unified-media-workflow` checkout. Present verification evidence and commit list to the user; merge only after their explicit approval.
