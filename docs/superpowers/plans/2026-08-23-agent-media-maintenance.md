# Agent Media Maintenance Implementation Plan

> **Current status:** Paused after the filesystem-foundation work. Conversion staging, apply orchestration, public CLI wiring, and end-to-end completion remain unfinished; `media:maintain` must not be presented as available.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a resumable, machine-readable `media:maintain plan/apply` workflow that converts live JPEG/PNG/GIF media to verified WebP, rewrites its published references, and permanently deletes only the exact validated orphan set.

**Architecture:** The existing content loader, reference collector, managed-path resolver, image tools, and validator remain authoritative. The validator exposes one reusable library snapshot so planning does not walk the media tree twice. Maintenance-specific modules own immutable manifests, exact source edits, retained-file operations, bounded conversion, locking/journaling, and the apply state machine. `scripts/media.ts` only parses input, calls the service, and emits one JSON envelope.

**Tech Stack:** Bun 1.2.20+, TypeScript 5.9, `yaml` 2.9 AST nodes, Node filesystem/path/crypto/os APIs, `cwebp`, `gif2webp`, `webpinfo`, Bun test, Astro 7.

**Spec:** `docs/superpowers/specs/2026-08-23-agent-media-maintenance-design.md`

## Global Constraints

- Work on `main`, but do not run Git commands or change Git state unless the user explicitly requests it.
- Never run maintenance apply against `/Users/astrochan/Documents/Workstation/astrosphere-media` while implementing or testing. Use temporary repositories and media roots.
- Keep all manifests, state, locks, snapshots, and staging beneath `MEDIA_ROOT/.astrosphere/maintenance/`; that tree must remain private and excluded from validation/sync.
- `plan` is read-only with respect to content and managed media. It may create only its private operation manifest/state.
- `apply` accepts only an operation ID, never an arbitrary manifest path, and has no `--force`, `--yes`, or one-shot mode.
- Permanent deletion starts only after verified outputs are active, content rewrites are durable, and the full validator reports the exact expected orphan set.
- Existing WebP and AVIF files remain unchanged. JPEG, PNG, and GIF are the only conversion inputs.
- A stale, unsafe, collided, or externally modified plan must fail before mutation.
- stdout contains exactly one versioned JSON envelope for every `maintain` invocation. Coarse progress may use stderr. Existing commands keep their current output contracts.
- Operation manifests are immutable; state changes use write-to-sibling-plus-rename atomic replacement.
- Planning hashes only conversion sources, deletion targets, and affected content files.
- Conversion order and result ordering are deterministic even when execution uses a bounded worker pool.
- Documentation changes happen only after all implementation tests and end-to-end fixtures pass.

## File Structure

**Create:**

- `src/lib/media/maintenance-types.ts` — versioned manifest, journal, result, and JSON-envelope types.
- `src/lib/media/maintenance-manifest.ts` — operation IDs, schema validation, hashing, canonical-root checks, immutable manifest and atomic state I/O.
- `src/lib/media/maintenance-rewrites.ts` — YAML/body reference locators and simultaneous exact text edits.
- `src/lib/media/maintenance-fs.ts` — no-follow snapshots, atomic no-replace activation, lock lifecycle, safe unlink, bounded empty-directory cleanup.
- `src/lib/media/maintenance-plan.ts` — one-snapshot classification, collision/disk checks, rewrite construction, and operation publication.
- `src/lib/media/maintenance-convert.ts` — bounded staging and WebP verification.
- `src/lib/media/maintenance-apply.ts` — resumable preflight/activate/validate/delete/finalize state machine.
- `tests/media-maintenance-manifest.test.ts`
- `tests/media-maintenance-rewrites.test.ts`
- `tests/media-maintenance-plan.test.ts`
- `tests/media-maintenance-fs.test.ts`
- `tests/media-maintenance-convert.test.ts`
- `tests/media-maintenance-apply.test.ts`

**Modify:**

- `src/lib/media/validator.ts` and `tests/media-validator.test.ts` — expose and reuse a single managed-library snapshot.
- `src/lib/media/cli.ts`, `src/lib/media/errors.ts`, `scripts/media.ts`, `package.json`, and `tests/media-cli.test.ts` — public command, parsing, JSON output, and exit behavior.
- `AGENTS.md`, `README.md`, `docs/deployment-vps.md`, `docs/content-agent-guide.md`, and `docs/BLACKSOULS-II-CONTENT-GUIDE.md` — verified operational guidance.

---

### Task 1: Define the CLI and versioned JSON contract

**Files:**

- Create: `src/lib/media/maintenance-types.ts`
- Modify: `src/lib/media/cli.ts`
- Modify: `src/lib/media/errors.ts`
- Modify: `tests/media-cli.test.ts`

**Interfaces:**

- Produces: `MaintainArgs`, `parseMaintainArgs(argv, availableProcessors?)`, `maintenanceHelp`, `MaintenanceEnvelope<T>`, `MaintenanceErrorBody`, and maintenance exit code `7`.
- Consumes: no filesystem state and no `MEDIA_ROOT`; parsing stays pure.

- [ ] **Step 1: Write failing parser tests**

```ts
expect(parseMediaCommand(["maintain", "plan"])).toEqual({
  command: "maintain",
  args: ["plan"],
});
expect(parseMaintainArgs(["plan"], 12)).toEqual({
  action: "plan",
  quality: 85,
});
expect(parseMaintainArgs(["plan", "--quality", "91"], 12)).toEqual({
  action: "plan",
  quality: 91,
});
expect(parseMaintainArgs(["apply", "20260823T120000Z-a1b2c3d4", "--jobs", "3"], 12)).toEqual({
  action: "apply",
  operationId: "20260823T120000Z-a1b2c3d4",
  jobs: 3,
});
expect(() => parseMaintainArgs(["apply", "../manifest"], 4)).toThrow("operation ID");
expect(() => parseMaintainArgs(["plan", "--jobs", "2"], 4)).toThrow("Unknown plan option");
expect(() => parseMaintainArgs(["apply", "safe-id", "--quality", "80"], 4)).toThrow("Unknown apply option");
```

- [ ] **Step 2: Run the parser test and confirm failure**

Run: `bun test tests/media-cli.test.ts`

Expected: FAIL because `maintain` and `parseMaintainArgs` do not exist.

- [ ] **Step 3: Add the pure argument model**

```ts
export type MaintainArgs =
  | { action: "plan"; quality: number }
  | { action: "apply"; operationId: string; jobs: number };

export const maintenanceOperationIdPattern =
  /^[a-z0-9][a-z0-9-]{0,79}$/;

export const defaultMaintenanceJobs = (processors: number): number =>
  Math.max(1, Math.min(4, Math.floor(processors)));
```

Add `maintain` to `MediaCommand`. Parse `plan` and `apply` independently, reject duplicate/foreign options, enforce quality `1..100`, jobs `1..32`, exactly one apply operation ID, and the safe ID pattern. Pass `availableParallelism()` from production; tests inject a number.

- [ ] **Step 4: Define stable envelopes and error categories**

```ts
export type MaintenanceEnvelope<T> = {
  schemaVersion: 1;
  command: "media:maintain";
  ok: true;
  result: T;
};

export type MaintenanceErrorBody = {
  category: "usage" | "configuration" | "validation" | "optimization" | "state";
  code: string;
  message: string;
  operationId?: string;
  context?: Record<string, string | number | boolean>;
};

export type MaintenanceErrorEnvelope = {
  schemaVersion: 1;
  command: "media:maintain";
  ok: false;
  error: MaintenanceErrorBody;
};
```

Extend `MediaErrorKind` with `maintenance` and add exit code `7`. Do not change existing exit codes.

- [ ] **Step 5: Run focused tests**

Run: `bun test tests/media-cli.test.ts`

Expected: parser/help/error tests pass; no public package script exists yet.

---

### Task 2: Build immutable operation manifests and atomic journals

**Files:**

- Create: `src/lib/media/maintenance-manifest.ts`
- Create: `tests/media-maintenance-manifest.test.ts`
- Modify: `src/lib/media/maintenance-types.ts`

**Interfaces:**

- Produces: `MaintenanceManifestV1`, `MaintenanceStateV1`, `maintenancePaths(root, operationId)`, `createOperationId(now, randomBytes?)`, `sha256File(path)`, `writeNewManifest()`, `readManifest()`, `readState()`, and `writeStateAtomic()`.
- Consumes: canonical project/media roots and root-relative records from the planner.

- [ ] **Step 1: Write failing deterministic path and ID tests**

```ts
expect(createOperationId(new Date("2026-08-23T12:00:00Z"), () => "a1b2c3d4")).toBe(
  "20260823t120000z-a1b2c3d4",
);
expect(maintenancePaths("/media", "safe-id")).toEqual({
  directory: "/media/.astrosphere/maintenance",
  manifest: "/media/.astrosphere/maintenance/safe-id.manifest.json",
  state: "/media/.astrosphere/maintenance/safe-id.state.json",
  operation: "/media/.astrosphere/maintenance/safe-id",
  staging: "/media/.astrosphere/maintenance/safe-id/staging",
  lock: "/media/.astrosphere/maintenance/apply.lock",
});
expect(() => maintenancePaths("/media", "../escape")).toThrow("operation ID");
```

- [ ] **Step 2: Define the complete version 1 records**

```ts
export type MaintenanceConversionV1 = {
  sourceRelativePath: string;
  sourcePublicPath: string;
  sourceBytes: number;
  sourceMtimeMs: number;
  sourceSha256: string;
  sourceFormat: "jpeg" | "png" | "gif";
  destinationRelativePath: string;
  destinationPublicPath: string;
  references: Array<{ source: string; field: string }>;
};

export type MaintenanceDeletionV1 = {
  relativePath: string;
  publicPath: string;
  bytes: number;
  sha256: string;
  reason: "orphan" | "replaced-original";
};

export type MaintenanceContentRewriteV1 = {
  relativePath: string;
  beforeSha256: string;
  afterSha256: string;
  edits: Array<{ start: number; end: number; before: string; after: string; field: string }>;
};
```

The manifest also includes `schemaVersion: 1`, operation metadata, canonical root identities, quality, validator baseline, conversions, deletions, content rewrites, destination checks, and expected intermediate/final totals. The state union includes phases `planned | staging | activated | deleting | complete | failed-before-delete | blocked-after-delete`, sorted completed-item arrays, final result, and safe failure data.

- [ ] **Step 3: Implement strict runtime validation**

Reject unknown schema versions, extra top-level keys, absolute stored paths, `.`/`..`/empty path segments, backslashes, duplicate paths, invalid hashes, invalid formats/reasons, unsorted records, a conversion source absent from `replaced-original` deletions, and destination/source portable-name collisions. Resolve operation files only through `maintenancePaths()`.

- [ ] **Step 4: Test immutable and atomic persistence**

Create a temporary media root. Assert `writeNewManifest()` uses exclusive creation and a second write fails. Assert state updates replace the prior JSON without leaving sibling temp files. Truncate/corrupt each file and assert reads fail with stable `state` error codes. Assert a manifest path or operation ID supplied from JSON cannot redirect reads outside the private directory.

- [ ] **Step 5: Test candidate hashing**

Write two files, hash one with `sha256File()`, and compare against `createHash("sha256")`. Assert symlinks and non-regular files are rejected rather than followed.

- [ ] **Step 6: Run focused tests**

Run: `bun test tests/media-maintenance-manifest.test.ts`

Expected: all schema, safety, immutability, atomicity, and hashing tests pass.

---

### Task 3: Plan exact content rewrites without reformatting Markdown

**Files:**

- Create: `src/lib/media/maintenance-rewrites.ts`
- Create: `tests/media-maintenance-rewrites.test.ts`

**Interfaces:**

- Produces: `planMaintenanceContentRewrites(projectRoot, entries, replacements, readText?)`, `applyTextEdits(source, edits)`, and `verifyContentRewrite(source, record)`.
- Consumes: published `MediaContentEntry[]`, collected `MediaReference[]`, and `Map<oldPublicPath, newPublicPath>`.

- [ ] **Step 1: Write failing simultaneous-edit tests**

```ts
const source = `---
slug: set
status: published
hero:
  src: /media/images/set/a.jpg
media:
  - src: /media/images/set/a.jpg-large.png
---
![A](/media/images/set/a.jpg)
<img src="/media/images/set/a.jpg-large.png">
`;
const legacy = "/media/images/set/a.jpg";
const first = source.indexOf(legacy);
const second = source.indexOf(legacy, first + legacy.length);
const output = applyTextEdits(source, [
  { start: first, end: first + legacy.length, before: legacy, after: "/media/images/set/a.webp", field: "hero.src" },
  { start: second, end: second + legacy.length, before: legacy, after: "/media/images/set/a.webp", field: "body.markdown" },
]);
expect(output.match(/\/media\/images\/set\/a\.webp/g)).toHaveLength(2);
expect(output).toContain("/media/images/set/a.jpg-large.png");
```

Add full planner assertions covering YAML `src`/`poster` scalars, Markdown image destinations, HTML `src` attributes, repeated references, and overlapping legacy names. Assert prose and code blocks containing the same string are not rewritten unless collected as media references.

- [ ] **Step 2: Locate frontmatter scalars by YAML node ranges**

Use `parseDocument(frontmatterText, { keepSourceTokens: true })`. Convert collector fields such as `hero.src`, `media[0].src`, and `art[1].poster` into YAML paths, retrieve the scalar node with `getIn(path, true)`, and use its range to make an exact text edit. Preserve original quote style and surrounding whitespace by changing only the scalar value bytes. Reject aliases, merged keys, non-string nodes, or mismatched current values.

- [ ] **Step 3: Locate body references by capture offsets**

Run the same Markdown-image and HTML-`src` expressions used by `references.ts`, but retain match indices. Match each collected `{source, field, publicPath}` to one exact captured range. Ignore ordinary prose. Reject an unmatched or ambiguous reference instead of guessing.

- [ ] **Step 4: Handle manga reader metadata once**

For `pages[n]` references in one chapter, require one consistent old extension and one destination extension, locate the frontmatter `pageExtension` YAML scalar, and emit exactly one edit to `webp`. Reject mixed page destinations or any other reader metadata mutation.

- [ ] **Step 5: Apply edits safely and deterministically**

Sort edits by ascending range in the manifest, reject overlap, assert each `before` slice exactly matches, then apply from the end of the source toward the beginning. Calculate and store before/after SHA-256 hashes over exact UTF-8 bytes. A rerun must recognize the exact `afterSha256` as already activated; any third state is stale.

- [ ] **Step 6: Run focused tests**

Run: `bun test tests/media-maintenance-rewrites.test.ts`

Expected: all frontmatter/body/reader, overlap, formatting-preservation, and stale-state tests pass.

---

### Task 4: Expose one validator snapshot and implement planning

**Files:**

- Modify: `src/lib/media/validator.ts`
- Modify: `tests/media-validator.test.ts`
- Create: `src/lib/media/maintenance-plan.ts`
- Create: `tests/media-maintenance-plan.test.ts`

**Interfaces:**

- Produces from validator: `MediaLibraryFile`, `MediaLibrarySnapshot`, `scanManagedMedia(root, adapters?)`, and optional `snapshot` input for `validateMedia()`.
- Produces from planner: `planMediaMaintenance(options, adapters?) => Promise<MaintenancePlanResult>`.
- Consumes: content entries/references, the shared snapshot, rewrite planner, manifest storage, candidate hasher, and disk-space adapter.

- [ ] **Step 1: Refactor the validator under existing tests**

```ts
export type MediaLibraryFile = {
  filePath: string;
  publicPath: string;
  relativePath: string;
  bytes: number;
  mtimeMs: number;
  format: ImageFormat;
  device: number;
  inode: number;
};

export type MediaLibrarySnapshot = {
  root: string;
  files: MediaLibraryFile[];
};
```

Move the managed-tree walk/header inspection into `scanManagedMedia()`. It must reject symlinks/unsafe entries exactly as today, sort by public path, and never enter `.astrosphere`. Let `validateMedia()` consume a supplied snapshot without walking or re-reading headers. Keep every current validator result and formatted report unchanged.

- [ ] **Step 2: Run validator regression tests**

Run: `bun test tests/media-validator.test.ts`

Expected: all old tests pass plus a new adapter counter proves one supplied snapshot causes zero validator walks.

- [ ] **Step 3: Write failing planner classification tests**

Create a temporary published content fixture with one JPEG hero, one PNG body image, one GIF gallery image, one WebP reader, one AVIF image, and two valid orphans. Assert the plan contains three conversions, five deletions (three replaced originals plus two orphans), leaves WebP/AVIF untouched, and sorts every list by public path.

- [ ] **Step 4: Implement a single-snapshot plan**

```ts
export type PlanMediaMaintenanceOptions = {
  projectRoot: string;
  mediaRoot: string;
  quality: number;
};

export type MaintenancePlanResult =
  | { status: "clean"; baseline: MaintenanceTotals }
  | { status: "planned"; operationId: string; manifestPath: string; summary: MaintenancePlanSummary };
```

Load content once, collect references once, scan media once, and pass that snapshot to the validator. Refuse any baseline errors. Use the validator orphan list for `reason: "orphan"`. Group referenced files by public path; convert only detected JPEG/PNG/GIF. Derive the sibling `.webp` URL/path and include the source once even if many content fields reference it.

- [ ] **Step 5: Reject collisions and unsafe plans**

Reject an existing destination, two inputs mapping to the same normalized destination, case/NFC portable-name collisions, references that resolve outside approved roots, content files outside `src/content`, symlinks, or root identity changes. Do not rename files automatically.

- [ ] **Step 6: Hash only affected candidates**

Inject a counting `hashFile` adapter. Assert the planner hashes exactly: each unique conversion source, each unique orphan, and each affected content file. It must not hash existing referenced WebP/AVIF or unrelated content.

- [ ] **Step 7: Check capacity and publish the operation**

Use `statfs()` on the maintenance directory filesystem. Require conversion source bytes plus a margin of `max(64 MiB, ceil(sourceBytes * 0.10))` for retained input snapshots and outputs. Return a stable `insufficient-space` error before manifest creation. Otherwise write the immutable manifest and initial `planned` state. A clean library creates neither.

Expected totals are calculated explicitly:

```ts
const intermediateFiles = baseline.files + conversions.length;
const intermediateOrphans = baseline.orphans + conversions.length;
const finalFiles = baseline.files - baseline.orphans;
const finalReferences = baseline.references;
```

- [ ] **Step 8: Run focused tests**

Run: `bun test tests/media-validator.test.ts tests/media-maintenance-plan.test.ts`

Expected: one-pass, clean, conversion, orphan, collision, hashing, capacity, root, and deterministic-manifest tests pass.

---

### Task 5: Add capability-safe locking, staging, activation, and deletion primitives

**Files:**

- Create: `src/lib/media/maintenance-fs.ts`
- Create: `tests/media-maintenance-fs.test.ts`

**Interfaces:**

- Produces: `acquireMaintenanceLock()`, `releaseMaintenanceLock()`, `snapshotRegularFile()`, `activateFileNoReplace()`, `replaceContentAtomic()`, `unlinkPlannedFile()`, and `removeEmptyManagedParents()`.
- Consumes: expected size/mtime/hash/identity from a validated manifest and operation-owned staging paths.

- [ ] **Step 1: Write failing exclusive-lock tests**

Create one lock, assert a second live holder gets `busy`, release it, and reacquire. Simulate a dead PID lock whose file is regular, owned by the current user, and valid JSON; assert it is removed and reacquired. Symlinked, malformed, wrong-root, or live locks fail closed. The lock body is:

```ts
type MaintenanceLockV1 = {
  schemaVersion: 1;
  operationId: string;
  pid: number;
  mediaRoot: string;
  createdAt: string;
};
```

- [ ] **Step 2: Snapshot source files without following links**

Open each planned source with `O_RDONLY | O_NOFOLLOW`, verify regular-file `dev`, `ino`, size, and mtime, then stream-copy it into an exclusively created operation staging file while calculating SHA-256. Reject a hash mismatch and remove the partial snapshot. External converters operate only on this private immutable snapshot, not the live path.

- [ ] **Step 3: Activate outputs without replacement**

Ensure the destination parent resolves inside `MEDIA_ROOT/manga` or `MEDIA_ROOT/images`, is a retained real directory, and the destination is absent. Use a same-filesystem hard link from the verified staged output to the final destination; `link()` supplies atomic no-replace behavior. Reinspect and hash the activated regular file, then unlink only the staging link. Fail on `EEXIST` or cross-device staging instead of replacing.

- [ ] **Step 4: Atomically replace content with rollback material**

Write the exact expected post-edit bytes to a sibling file opened with `wx`, `fsync` the file, rename over the original only after its current hash matches `beforeSha256`, then `fsync` the parent directory where supported. Keep the exact original bytes in operation staging until the pre-delete validation succeeds. A rollback performs the same atomic replacement after verifying the active file has `afterSha256`.

- [ ] **Step 5: Permanently unlink only revalidated targets**

Before unlink, open no-follow, verify regular-file identity/size/hash against the manifest, then unlink the exact resolved managed path. An absent file is accepted only when the journal already records that public path as deleted. Remove empty parent directories one level at a time, stopping at the retained `manga` or `images` root and never following symlinks.

- [ ] **Step 6: Run focused tests**

Run: `bun test tests/media-maintenance-fs.test.ts`

Expected: lock, dead-lock recovery, symlink/race rejection, no-replace activation, atomic content rollback, exact unlink, absent-target, and root-bounded cleanup tests pass.

---

### Task 6: Stage verified conversions with bounded concurrency

**Files:**

- Create: `src/lib/media/maintenance-convert.ts`
- Create: `tests/media-maintenance-convert.test.ts`

**Interfaces:**

- Produces: `stageMaintenanceConversions(manifest, state, jobs, adapters?) => Promise<MaintenanceStateV1>`.
- Consumes: `snapshotRegularFile()`, `createImageCommand()`, `verifyWebp()`, `requireTool()`, `runCommand()`, immutable manifest records, and atomic state writes.

- [ ] **Step 1: Write failing routing tests**

Inject a runner and assert JPEG/PNG invoke `cwebp`, GIF invokes `gif2webp`, all successful outputs invoke `webpinfo`, and manifest quality is passed verbatim. Assert no command is generated for WebP/AVIF because the manifest validator prevents those conversion records.

- [ ] **Step 2: Require tools once per operation**

Inspect formats before spawning work. Require `cwebp` only when JPEG/PNG work exists, `gif2webp` only when GIF work exists, and `webpinfo` whenever any conversion exists. A missing tool fails before any worker starts and leaves state at `planned`.

- [ ] **Step 3: Implement the deterministic worker pool**

```ts
const worker = async (): Promise<void> => {
  while (true) {
    const index = nextIndex++;
    if (index >= conversions.length) return;
    await stageOne(conversions[index]!);
  }
};
await Promise.all(Array.from({ length: Math.min(jobs, conversions.length) }, worker));
```

Sort conversions before assigning indices. Each worker snapshots its retained input, creates an exclusive staged output, runs the converter, verifies WebP, records output bytes/hash, and atomically journals completion. Serialize journal writes through one promise queue so workers cannot lose updates. Final state arrays remain manifest-order, not completion-order.

- [ ] **Step 4: Test failure and resume**

Use a controllable runner to prove active conversions never exceed `jobs`. Fail one conversion and assert no destination is active, successful staged records remain resumable, partial output is removed, and state reports `failed-before-delete`. Rerun and assert already verified staged items are hash-checked and skipped while remaining items complete.

- [ ] **Step 5: Run focused tests**

Run: `bun test tests/media-maintenance-convert.test.ts`

Expected: tool routing, verification, bounded concurrency, deterministic state, failure cleanup, and resume tests pass.

---

### Task 7: Implement the resumable apply state machine

**Files:**

- Create: `src/lib/media/maintenance-apply.ts`
- Create: `tests/media-maintenance-apply.test.ts`

**Interfaces:**

- Produces: `applyMediaMaintenance(options, adapters?) => Promise<MaintenanceApplyResult>`.
- Consumes: manifest/state storage, lock and filesystem primitives, staged converter, content rewrite verification, content/reference loader, and full validator.

- [ ] **Step 1: Write failing preflight tests**

Cover changed project/media canonical roots, changed conversion source bytes/mtime/hash, changed orphan hash, changed content hash, newly occupied destinations, invalid manifest JSON, operation ID mismatch, and traversal/symlink substitution. Assert all fail before staging, content writes, activation, or deletion.

- [ ] **Step 2: Implement preflight and phase entry**

Acquire the global lock first, load the manifest only from the operation ID, validate schema/ownership, and canonicalize both roots. Revalidate every affected path and content file. Accept an activated destination/content file only when the journal phase and expected post-state agree; otherwise classify it as external mutation. Always release the lock in `finally`.

- [ ] **Step 3: Activate outputs and content transactionally**

After staging completes, activate verified WebPs in manifest order, journaling each. Then atomically install content rewrites. Before deletion begins, any activation/content failure restores original content, removes only operation-owned activated WebPs, verifies the baseline hashes, and records `failed-before-delete`.

- [ ] **Step 4: Enforce the exact pre-delete orphan gate**

Reload content from disk, collect references, scan/validate the full managed library, and require:

```ts
expect(report.errors).toEqual([]);
expect(report.files).toBe(manifest.expected.intermediate.files);
expect(report.references).toBe(manifest.expected.intermediate.references);
expect(report.orphans.map((item) => item.publicPath)).toEqual(
  manifest.deletions.map((item) => item.publicPath),
);
```

Any mismatch rolls back because deletion has not started. Do not silently add newly discovered orphans to the operation.

- [ ] **Step 5: Delete and journal one target at a time**

Set phase `deleting` durably before the first unlink. Revalidate, permanently unlink, journal, and optionally remove empty parents for each manifest deletion in stable order. A process interruption can therefore resume at the first unrecorded item. Once this phase begins, errors become `blocked-after-delete`; never claim full rollback.

- [ ] **Step 6: Validate and finalize**

Run a fresh full validation and require exact final files/references plus zero errors/orphans. Remove operation staging, write phase `complete` with byte/conversion/rewrite/deletion totals, then return `status: "applied"`. A later apply of the same operation revalidates the completed result and returns `status: "already-applied"` without mutation.

- [ ] **Step 7: Test interruption and idempotency**

Inject a failure after the first deletion. Assert state records exactly one deleted path. Rerun with the same operation ID and assert the recorded absence is accepted, remaining targets are deleted, final validation passes, and a third run returns already-applied. Also test an unrecorded missing target and external post-delete mutation fail honestly.

- [ ] **Step 8: Run focused tests**

Run: `bun test tests/media-maintenance-apply.test.ts`

Expected: stale-plan, locking, rollback, exact-orphan, permanent-delete, resume, final validation, and idempotency tests pass.

---

### Task 8: Wire the public command and prove its agent contract end to end

**Files:**

- Modify: `scripts/media.ts`
- Modify: `src/lib/media/cli.ts`
- Modify: `package.json`
- Modify: `tests/media-cli.test.ts`
- Modify: `tests/media-maintenance-apply.test.ts`

**Interfaces:**

- Produces: `bun run media:maintain plan [--quality N]` and `bun run media:maintain apply <operation-id> [--jobs N]`.
- Consumes: `planMediaMaintenance()`, `applyMediaMaintenance()`, `requireMediaRoot()`, and JSON envelope types.

- [ ] **Step 1: Add the package command and thin dispatcher**

```json
"media:maintain": "bun scripts/media.ts maintain"
```

The maintain branch must be the only branch that owns JSON stdout. It calls `parseMaintainArgs()`, injects `process.cwd()` and `requireMediaRoot()`, invokes plan/apply, and writes exactly `JSON.stringify(envelope) + "\n"` once.

- [ ] **Step 2: Add structured error translation**

Map known errors to stable `{category, code, message, operationId?, context?}`. The top-level catch must detect maintain mode before using the legacy `Media command failed:` path. No stack trace or tool stderr enters stdout. Preserve existing behavior for serve/add/remove/optimize/validate/sync.

- [ ] **Step 3: Add subprocess contract tests**

Assert every maintain invocation has exactly one parseable stdout JSON value. Cover clean, planned, applied, already-applied, usage error, missing `MEDIA_ROOT`, validation error, missing converter, stale state, and busy lock. Assert nonzero cases have `ok: false` and the expected stable code/exit category.

- [ ] **Step 4: Add a real-tool temporary end-to-end fixture**

Create a temporary repo/media root with tiny valid JPEG, PNG, GIF, and WebP fixtures plus referenced content and one orphan. Skip only when a required WebP tool is genuinely unavailable. Run plan through the subprocess, capture its operation ID, run apply, then assert:

- content points to `.webp` and retains unrelated formatting;
- three verified WebP outputs exist;
- the three originals and orphan are permanently absent;
- `.astrosphere/maintenance` is private and intact;
- a fresh validator has zero errors and zero orphans;
- rerunning apply returns `already-applied`.

- [ ] **Step 5: Run all media tests**

Run: `bun test tests/media-*.test.ts`

Expected: all existing and new media tests pass.

---

### Task 9: Verify first, then update agent and operator documentation

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/deployment-vps.md`
- Modify: `docs/content-agent-guide.md`
- Modify: `docs/BLACKSOULS-II-CONTENT-GUIDE.md`
- Modify: `src/lib/media/cli.ts`

**Interfaces:**

- Documents: two-step autonomous workflow, JSON output, permanent deletion, stale-plan behavior, resume/idempotency, sync boundary, and command examples.
- Preserves: all existing import/remove/validate/sync rules and historical specs/plans.

- [ ] **Step 1: Run the full implementation gate before docs**

Run:

```text
bun test
bun run astro check
bun run build
```

Expected: every command exits `0`. Fix implementation failures before editing operational docs.

- [ ] **Step 2: Update root agent instructions**

Add concise rules requiring agents to:

```text
bun run media:maintain plan
bun run media:maintain apply <operation-id>
```

State that apply permanently deletes only the immutable plan, needs no prompt, is resumable/idempotent, must never be replaced with ad hoc cleanup commands, and does not run Git, deployment, sync, or backup actions. Retain the existing `media:remove ... --unavailable` rule for deliberate chapter unpublishing; maintenance is for global live-library hygiene.

- [ ] **Step 3: Update README and operational guides**

Document the human workflow in `README.md`, the pre-sync maintenance option and separation from remote prune in `docs/deployment-vps.md`, agent-safe content implications in `docs/content-agent-guide.md`, and the same validation/maintenance boundary for BLACKSOULS galleries. Update CLI help to list plan/apply options and JSON behavior. Do not rewrite historical design/plan documents.

- [ ] **Step 4: Run documentation-sensitive verification**

Run:

```text
bun test
bun run astro check
bun run build
MEDIA_ROOT=/Users/astrochan/Documents/Workstation/astrosphere-media bun run media:validate
```

Expected: tests/check/build exit `0`; the read-only live validation reports zero errors and zero orphans. Do not run `media:maintain apply` against the real media root as part of verification.

- [ ] **Step 5: Review the resulting changes without changing Git state**

Inspect the changed-file list and diffs using non-Git filesystem tools if needed. Confirm no heavy media, staging files, operation records, temporary fixtures, or generated build output were added to the repository. Leave committing and pushing for an explicit user instruction.

---

## Final Acceptance Checklist

- [ ] `media:maintain plan` returns one `clean` or `planned` JSON envelope.
- [ ] `media:maintain apply <operation-id>` applies only that immutable operation without a prompt.
- [ ] Planning walks the managed library once and hashes only affected candidates.
- [ ] Existing WebP/AVIF files are untouched; JPEG/PNG/GIF outputs pass `webpinfo`.
- [ ] Explicit content references and reader `pageExtension` update without unrelated reformatting.
- [ ] Stale/unsafe/collided plans mutate nothing.
- [ ] Pre-delete validation requires the exact manifest orphan set.
- [ ] Only planned, freshly revalidated files are permanently unlinked.
- [ ] Interrupted deletion resumes; completed apply is idempotent.
- [ ] Final validation has zero errors and zero orphans.
- [ ] Existing media commands retain their current behavior.
- [ ] Agent/operator docs accurately describe permissions and boundaries.
- [ ] No Git operation occurs until the user explicitly asks for one.
