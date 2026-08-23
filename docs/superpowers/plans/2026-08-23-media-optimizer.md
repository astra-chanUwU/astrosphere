# Media Optimizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a non-destructive optimizer for files, directories, ZIP archives, and CBZ archives with reader/gallery profiles and correct still/animated WebP routing.

**Architecture:** Pure helpers identify formats and build deterministic output plans. A ZIP adapter performs read-only archive inspection and safe staged extraction through the system `unzip` command; a transactional coordinator runs `cwebp`, `gif2webp`, and `webpinfo` behind an injectable process boundary before atomically installing output.

**Tech Stack:** Bun 1.2.20+, TypeScript 5.9, Node filesystem/path APIs, Info-ZIP `unzip`, libwebp tools (`cwebp`, `gif2webp`, `webpinfo`), Bun test.

**Spec:** `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`

## Global Constraints

- Implement `bun run media:optimize <source> --output <destination> --profile <reader|gallery>` with optional `--quality 1..100` and `--dry-run`.
- Sources are never modified or deleted; existing destinations are refused.
- Dry-run performs no extraction, conversion, staging-directory creation, or destination mutation.
- JPEG/PNG use `cwebp`; all GIFs use `gif2webp`; WebP is copied unchanged; AVIF is recognized but rejected as optimizer input.
- Reader output is naturally sorted and named `001.webp`, `002.webp`, and so on.
- Gallery output preserves relative directories/base names and rejects portable case-insensitive collisions.
- Any accepted-file failure fails the whole transaction; platform junk is reported separately and ignored.
- Require the foundation plan `docs/superpowers/plans/2026-08-23-unified-media-foundation.md` to be complete first.

---

### Task 1: Process boundary and image-format detection

**Files:**
- Create: `src/lib/media/process.ts`
- Create: `src/lib/media/image-format.ts`
- Create: `tests/media-image-format.test.ts`

**Interfaces:**
- Produces: `CommandResult`, `CommandRunner`, `runCommand(argv, options?)`, `requireTool(name, which?)`, `ImageFormat`, `detectImageFormatFromBytes(bytes)`, `detectImageFormat(path)`, `createImageCommand(item)`, and `verifyWebp(path, runner?)`.
- Consumes: no optimizer profile behavior.

- [ ] **Step 1: Write failing signature and routing tests**

```ts
import { expect, test } from "bun:test";
import { createImageCommand, detectImageFormatFromBytes } from "../src/lib/media/image-format";

test("detects formats from bytes instead of extensions", () => {
  expect(detectImageFormatFromBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
  expect(detectImageFormatFromBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
  expect(detectImageFormatFromBytes(new TextEncoder().encode("GIF89a"))).toBe("gif");
  expect(detectImageFormatFromBytes(new TextEncoder().encode("RIFF1234WEBP"))).toBe("webp");
});

test("routes stills and GIFs to different libwebp tools", () => {
  expect(createImageCommand({ format: "jpeg", source: "/in/a.jpg", destination: "/out/a.webp", quality: 85 }))
    .toEqual(["cwebp", "-quiet", "-q", "85", "/in/a.jpg", "-o", "/out/a.webp"]);
  expect(createImageCommand({ format: "gif", source: "/in/a.gif", destination: "/out/a.webp", quality: 85 }))
    .toEqual(["gif2webp", "-quiet", "-mixed", "-q", "85", "/in/a.gif", "-o", "/out/a.webp"]);
  expect(createImageCommand({ format: "webp", source: "/in/a.webp", destination: "/out/a.webp", quality: 85 })).toBeUndefined();
  expect(() => createImageCommand({ format: "avif", source: "/in/a.avif", destination: "/out/a.webp", quality: 85 }))
    .toThrow("recognized but unsupported");
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test tests/media-image-format.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement the injectable process runner**

```ts
export type CommandResult = { exitCode: number; stdout: Uint8Array; stderr: string };
export type CommandRunner = (argv: string[], options?: { cwd?: string }) => Promise<CommandResult>;

export const runCommand: CommandRunner = async (argv, options) => {
  const child = Bun.spawn(argv, { cwd: options?.cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).bytes(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

export const requireTool = (name: string, which = Bun.which): string => {
  const path = which(name);
  if (!path) throw new Error(`Required media tool "${name}" is not installed.`);
  return path;
};
```

Do not invoke a shell. Every external command is an argument array.

- [ ] **Step 4: Implement byte signatures and conversion commands**

Define `ImageFormat = "jpeg" | "png" | "gif" | "webp" | "avif" | "unknown"`. Read at most the first 32 bytes in `detectImageFormat(path)`. Detect AVIF from an ISO-BMFF `ftyp` box whose compatible brands include `avif` or `avis`. `verifyWebp()` runs `webpinfo -quiet <path>` and throws with the basename when the exit code is nonzero.

- [ ] **Step 5: Run focused tests**

Run: `bun test tests/media-image-format.test.ts`

Expected: all format and command-routing tests pass.

- [ ] **Step 6: Commit the process and format boundary**

```bash
git add src/lib/media/process.ts src/lib/media/image-format.ts tests/media-image-format.test.ts
git commit -m "feat: detect and route media image formats"
```

---

### Task 2: Safe ZIP and CBZ inspection/extraction

**Files:**
- Create: `src/lib/media/archive.ts`
- Create: `tests/media-archive.test.ts`

**Interfaces:**
- Consumes: `CommandRunner` and `runCommand()` from Task 1.
- Produces: `ArchiveEntry`, `validateArchiveEntryPath(path)`, `listZipEntries(source, runner?)`, `readZipEntryHeader(source, entry, spawn?)`, and `extractZipArchive(source, destination, runner?)`.

- [ ] **Step 1: Write failing archive-path tests**

```ts
import { expect, test } from "bun:test";
import { listZipEntries, validateArchiveEntryPath } from "../src/lib/media/archive";

test("accepts nested relative entries and rejects archive escapes", () => {
  expect(validateArchiveEntryPath("book/chapter/001.png")).toBe("book/chapter/001.png");
  for (const unsafe of ["../secret", "book/../../secret", "/absolute", "C:/absolute", "\\\\server\\share", "book\\..\\secret"]) {
    expect(() => validateArchiveEntryPath(unsafe)).toThrow("unsafe archive path");
  }
});

test("lists entries through unzip without extracting", async () => {
  const calls: string[][] = [];
  const entries = await listZipEntries("/tmp/book.cbz", async (argv) => {
    calls.push(argv);
    return { exitCode: 0, stdout: new TextEncoder().encode("001.jpg\n__MACOSX/._001.jpg\n"), stderr: "" };
  });
  expect(calls).toEqual([["unzip", "-Z1", "/tmp/book.cbz"]]);
  expect(entries.map((entry) => entry.path)).toEqual(["001.jpg", "__MACOSX/._001.jpg"]);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test tests/media-archive.test.ts`

Expected: FAIL because `archive.ts` does not exist.

- [ ] **Step 3: Implement preflight listing and path rejection**

`validateArchiveEntryPath()` must reject NUL/newline characters, backslashes, absolute POSIX paths, drive-letter paths, UNC paths, empty non-directory paths, and any `..` segment. Normalize repeated `/` and `.` segments only after rejecting escape forms. `listZipEntries()` runs `unzip -Z1`, rejects a nonzero exit, validates every returned line, and marks entries ending `/` as directories.

- [ ] **Step 4: Implement read-only header inspection for dry-run**

`readZipEntryHeader()` spawns `unzip -p <archive> <entry>`, reads only the first stream chunk up to 32 bytes, terminates the child, and returns those bytes. Inject the spawn function in tests so no real archive is needed. A nonzero process exit before bytes arrive is an actionable archive error.

- [ ] **Step 5: Implement staged extraction and post-walk checks**

Run `unzip -qq <source> -d <destination>` only after all entries pass preflight. Recursively `lstat()` the destination afterward, reject symbolic links and non-file/non-directory entries, and verify every resolved path stays beneath the destination. On any error, remove only the destination created for the current extraction.

Add a test that creates a temporary extracted tree containing a symlink, injects an extraction runner that returns success without running unzip, and expects extraction verification to reject the symlink.

- [ ] **Step 6: Run archive tests**

Run: `bun test tests/media-archive.test.ts`

Expected: all archive inspection and safety tests pass.

- [ ] **Step 7: Commit the archive boundary**

```bash
git add src/lib/media/archive.ts tests/media-archive.test.ts
git commit -m "feat: safely inspect ZIP and CBZ sources"
```

---

### Task 3: Deterministic reader and gallery plans

**Files:**
- Create: `src/lib/media/optimizer.ts`
- Create: `tests/media-optimizer-plan.test.ts`

**Interfaces:**
- Consumes: image detection from Task 1 and archive entry inspection from Task 2.
- Produces: `OptimizerProfile`, `OptimizationSource`, `OptimizationItem`, `OptimizationPlan`, `OptimizeOptions`, `OptimizeResult`, `isIgnoredMediaJunk(path)`, `naturalSortMediaPaths(paths)`, `createReaderOutputName(index)`, and `planMediaOptimization(options, adapters?)`.

- [ ] **Step 1: Write failing plan tests for reader behavior**

```ts
import { expect, test } from "bun:test";
import { createReaderOutputName, planMediaOptimization } from "../src/lib/media/optimizer";

test("naturally orders one reader directory and emits padded WebP names", async () => {
  const plan = await planMediaOptimization({ source: "/source", destination: "/output", profile: "reader", quality: 85, dryRun: true }, {
    inspectSource: async () => [
      { path: "10.png", format: "png", bytes: 10 },
      { path: "2.jpg", format: "jpeg", bytes: 20 },
      { path: ".DS_Store", format: "unknown", bytes: 1 },
    ],
    pathExists: async () => false,
  });
  expect(createReaderOutputName(1)).toBe("001.webp");
  expect(plan.items.map((item) => item.outputRelativePath)).toEqual(["001.webp", "002.webp"]);
  expect(plan.ignored).toEqual([".DS_Store"]);
});

test("rejects ambiguous reader trees", async () => {
  await expect(planMediaOptimization({ source: "/source", destination: "/output", profile: "reader", quality: 85, dryRun: true }, {
    inspectSource: async () => [
      { path: "chapter-001/001.jpg", format: "jpeg", bytes: 10 },
      { path: "chapter-002/001.jpg", format: "jpeg", bytes: 10 },
    ],
    pathExists: async () => false,
  })).rejects.toThrow("multiple reader directories");
});
```

- [ ] **Step 2: Write failing gallery collision tests**

Test that `art/Cover.JPG` and `art/cover.png` fail because both map portably to `art/cover.webp`, while `set-a/cover.jpg` and `set-b/cover.jpg` remain distinct. Test that AVIF and unknown inputs identify the exact offending source and fail the plan.

- [ ] **Step 3: Run plan tests and confirm failure**

Run: `bun test tests/media-optimizer-plan.test.ts`

Expected: FAIL because the optimizer module does not exist.

- [ ] **Step 4: Implement pure profile planning**

```ts
export type OptimizerProfile = "reader" | "gallery";
export type OptimizationSource = { path: string; format: ImageFormat; bytes: number };
export type OptimizationItem = {
  sourcePath: string;
  sourceRelativePath: string;
  outputRelativePath: string;
  format: Exclude<ImageFormat, "avif" | "unknown">;
  action: "convert" | "copy";
  bytes: number;
};
export type OptimizationPlan = { source: string; destination: string; profile: OptimizerProfile; quality: number; items: OptimizationItem[]; ignored: string[]; originalBytes: number };
```

Reader mode may strip one common wrapper directory, but all accepted images must then share one parent. Gallery mode preserves relative directories. Collision keys use normalized `/` separators plus lowercase Unicode strings. Empty accepted sets fail.

- [ ] **Step 5: Replicate sanitizer coverage without breaking the legacy command**

Add natural sort and page-name assertions to `tests/media-optimizer-plan.test.ts`. Keep `src/lib/manga-sanitizer.ts`, `tests/manga-sanitizer.test.ts`, and `scripts/sanitize-manga.ts` intact through this plan so every intermediate commit remains runnable. The synchronization/cleanup plan removes all three together after `media:optimize` is verified.

- [ ] **Step 6: Run optimizer plan tests**

Run: `bun test tests/media-optimizer-plan.test.ts`

Expected: reader, gallery, collision, junk, AVIF, and unknown-format tests pass.

- [ ] **Step 7: Commit deterministic planning**

```bash
git add src/lib/media/optimizer.ts tests/media-optimizer-plan.test.ts
git commit -m "feat: plan reader and gallery optimization"
```

---

### Task 4: Transactional optimization execution

**Files:**
- Modify: `src/lib/media/optimizer.ts`
- Create: `tests/media-optimizer-transaction.test.ts`

**Interfaces:**
- Consumes: `OptimizationPlan`, `createImageCommand()`, `verifyWebp()`, `extractZipArchive()`, and `CommandRunner`.
- Produces: `OptimizeAdapters = {runner?, which?, verifyOutput?}` and `optimizeMedia(options, adapters?): Promise<OptimizeResult>`.

- [ ] **Step 1: Write failing transaction tests with temporary directories**

Cover these exact cases:

```ts
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { optimizeMedia } from "../src/lib/media/optimizer";
import type { CommandRunner } from "../src/lib/media/process";

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const webp = new TextEncoder().encode("RIFF1234WEBP");
const tools = { which: (name: string) => `/tools/${name}`, verifyOutput: async () => undefined };

test("refuses an existing destination before creating staging", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-optimize-"));
  const source = join(root, "source");
  const destination = join(root, "output");
  await mkdir(source); await mkdir(destination); await Bun.write(join(source, "1.jpg"), jpeg);
  await expect(optimizeMedia({ source, destination, profile: "reader", quality: 85, dryRun: false }, tools)).rejects.toThrow("destination already exists");
  expect((await readdir(root)).some((name) => name.includes("media-staging"))).toBe(false);
});

test("copies WebP and converts JPEG through an injected command", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-optimize-"));
  const source = join(root, "source"); const destination = join(root, "output");
  await mkdir(source); await Bun.write(join(source, "1.webp"), webp); await Bun.write(join(source, "2.jpg"), jpeg);
  const calls: string[][] = [];
  const runner: CommandRunner = async (argv) => {
    calls.push(argv);
    await Bun.write(argv[argv.indexOf("-o") + 1], webp);
    return { exitCode: 0, stdout: new Uint8Array(), stderr: "" };
  };
  const result = await optimizeMedia({ source, destination, profile: "reader", quality: 85, dryRun: false }, { ...tools, runner });
  expect(calls[0]?.[0]).toBe("cwebp");
  expect(result).toMatchObject({ converted: 1, copied: 1, failed: 0 });
  expect(await Bun.file(join(destination, "001.webp")).exists()).toBe(true);
  expect(await Bun.file(join(destination, "002.webp")).exists()).toBe(true);
});

test("cleans staging and leaves source untouched on conversion failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-optimize-"));
  const source = join(root, "source"); const destination = join(root, "output");
  await mkdir(source); const input = join(source, "1.jpg"); await Bun.write(input, jpeg); const before = await Bun.file(input).bytes();
  const runner: CommandRunner = async () => ({ exitCode: 1, stdout: new Uint8Array(), stderr: "failed" });
  await expect(optimizeMedia({ source, destination, profile: "reader", quality: 85, dryRun: false }, { ...tools, runner })).rejects.toThrow("1.jpg");
  expect(await Bun.file(destination).exists()).toBe(false);
  expect(await Bun.file(input).bytes()).toEqual(before);
  expect((await readdir(root)).some((name) => name.includes("media-staging"))).toBe(false);
});

test("dry-run creates no output and invokes no conversion", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-optimize-"));
  const source = join(root, "source"); const destination = join(root, "output");
  await mkdir(source); await Bun.write(join(source, "1.jpg"), jpeg);
  const runner: CommandRunner = async () => { throw new Error("runner must not execute"); };
  const result = await optimizeMedia({ source, destination, profile: "reader", quality: 85, dryRun: true }, { ...tools, runner });
  expect(result.plan.items).toHaveLength(1);
  expect(await Bun.file(destination).exists()).toBe(false);
});
```

- [ ] **Step 2: Run the transaction tests and confirm missing execution behavior**

Run: `bun test tests/media-optimizer-transaction.test.ts`

Expected: FAIL because `optimizeMedia()` is not implemented.

- [ ] **Step 3: Implement the transaction sequence**

`optimizeMedia()` must execute in this order:

1. Resolve source and destination; require source existence, destination absence, and an existing destination parent.
2. Inspect files directly, or inspect archive entries without extraction for dry-run.
3. Build and return the plan immediately for dry-run.
4. Require `unzip` for archive sources, `cwebp` if JPEG/PNG exists, `gif2webp` if GIF exists, and `webpinfo` for every execution.
5. Create `.<destination-name>.media-staging-<uuid>` beside the destination.
6. Extract an archive into an owned temporary directory when needed.
7. Create parent directories for planned gallery outputs.
8. Copy WebP items; run the exact command for convert items.
9. Run `webpinfo -quiet` for every staged output and sum staged byte sizes.
10. Rename staging to destination atomically.
11. Remove extraction data; on failure remove staging/extraction and leave source/destination unchanged.

Return `{ plan, converted, copied, ignored, failed: 0, originalBytes, optimizedBytes, savedBytes }` only after successful rename. Wrap conversion, extraction, verification, and transaction failures in `MediaError("optimization", message)` without discarding the offending path.

- [ ] **Step 4: Run all optimizer tests**

Run: `bun test tests/media-image-format.test.ts tests/media-archive.test.ts tests/media-optimizer-plan.test.ts tests/media-optimizer-transaction.test.ts`

Expected: all optimizer tests pass.

- [ ] **Step 5: Commit transactional execution**

```bash
git add src/lib/media/optimizer.ts tests/media-optimizer-transaction.test.ts
git commit -m "feat: optimize media transactionally"
```

---

### Task 5: `media:optimize` CLI integration

**Files:**
- Modify: `src/lib/media/cli.ts`
- Modify: `scripts/media.ts`
- Modify: `package.json`
- Modify: `tests/media-cli.test.ts`

**Interfaces:**
- Consumes: `optimizeMedia()` from Task 4.
- Produces: `parseOptimizeArgs(argv): OptimizeOptions` and the `media:optimize` package command.

- [ ] **Step 1: Add failing option-parser tests**

```ts
expect(parseOptimizeArgs(["book.cbz", "--output", "/tmp/book", "--profile", "reader"]))
  .toEqual({ source: resolve("book.cbz"), destination: "/tmp/book", profile: "reader", quality: 85, dryRun: false });
expect(parseOptimizeArgs(["gallery", "--output", "/tmp/gallery", "--profile", "gallery", "--quality", "90", "--dry-run"]).quality).toBe(90);
expect(() => parseOptimizeArgs(["book.cbz", "--profile", "reader"])).toThrow("--output is required");
expect(() => parseOptimizeArgs(["book.cbz", "--output", "/tmp/book", "--profile", "reader", "--quality", "101"])).toThrow("1 to 100");
```

- [ ] **Step 2: Run the CLI test and confirm failure**

Run: `bun test tests/media-cli.test.ts`

Expected: FAIL because optimizer parsing/dispatch is absent.

- [ ] **Step 3: Implement strict parsing and human-readable summaries**

Add `"media:optimize": "bun scripts/media.ts optimize"` to `package.json`. Dispatch `optimize` to `parseOptimizeArgs()` and `optimizeMedia()`. Dry-run output begins `Media optimization dry run:` and prints each source-to-output mapping. Success output reports converted, copied, ignored, failed (`0`), original bytes, optimized bytes, and saved bytes. Errors continue through the shared top-level catch and exit with optimization code `5`.

- [ ] **Step 4: Run CLI and optimizer tests**

Run: `bun test tests/media-cli.test.ts tests/media-image-format.test.ts tests/media-archive.test.ts tests/media-optimizer-plan.test.ts tests/media-optimizer-transaction.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Perform a real temporary-directory smoke test**

Create a temporary directory with `mktemp -d`, decode a tiny one-pixel PNG test constant into its source directory using Bun, and run:

```bash
bun run media:optimize -- <temporary-source> --output <temporary-output> --profile reader --dry-run
bun run media:optimize -- <temporary-source> --output <temporary-output> --profile reader
webpinfo -quiet <temporary-output>/001.webp
```

Expected: dry-run creates no output; execution creates one valid WebP; the source PNG remains byte-identical. Remove only the temporary directory after inspection.

- [ ] **Step 6: Commit optimizer CLI integration**

```bash
git add src/lib/media/cli.ts scripts/media.ts package.json tests/media-cli.test.ts
git commit -m "feat: expose media optimizer command"
```

---

### Task 6: Optimizer regression gate

**Files:**
- Modify only if a regression is found in files owned by this plan.

**Interfaces:**
- Produces a passing baseline for standalone validation.

- [ ] **Step 1: Run the full test suite**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 2: Run Astro checks**

Run: `bun run astro check`

Expected: zero errors, warnings, and hints.

- [ ] **Step 3: Confirm a clean feature branch**

Run: `git status --short --branch`

Expected: clean `codex/unified-media-workflow` checkout.
