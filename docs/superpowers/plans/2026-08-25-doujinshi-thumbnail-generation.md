# Doujinshi Thumbnail Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Repository policy requires inline single-agent execution unless the user explicitly requests delegation and accepts its usage cost.

**Goal:** Generate and serve compact managed WebP derivatives for the doujinshi series preview grid and reader thumbnail rail while preserving full reader pages.

**Architecture:** A shared path helper derives thumbnail URLs without adding frontmatter. A focused media module discovers doujinshi pages, plans fresh or stale work, renders verified 320px WebP derivatives atomically, and is called by both the batch importer and a new backfill CLI command. Managed-reference collection and validation enforce published-thumbnail completeness before synchronization.

**Tech Stack:** Astro 7, TypeScript, Bun, Sharp, external `MEDIA_ROOT` storage, Bun test.

**Spec:** `docs/superpowers/specs/2026-08-25-doujinshi-thumbnail-generation-design.md`

## Global Constraints

- Thumbnail format is WebP only, maximum width 320 pixels, quality 70, preserved aspect ratio, and no enlargement.
- Thumbnail URLs use `/manga/<series>/<chapter>/thumbnails/<page>.webp`.
- Generated files stay beneath `MEDIA_ROOT/manga`; never write them into the repository or `public/`.
- Only `DoujinshiPagePreview.astro` and the `MangaReader.astro` preview rail use derivatives.
- Full reader pages, series cover cards, other manga formats, and image sets remain unchanged.
- Missing or invalid thumbnails for published available doujinshi fail validation; there is no runtime full-image fallback.
- Generation is incremental by default and supports forced regeneration.
- Use direct single-agent execution on `main`. Do not create a branch, worktree, or subagent.
- Run focused tests while editing. Run `media:validate` and `astro check` once after the final mutation.

---

### Task 1: Shared thumbnail URL convention

**Files:**
- Modify: `src/lib/manga-reader.ts`
- Modify: `tests/manga-reader.test.ts`

**Interfaces:**
- Consumes: existing `createMangaPageSrc(pagePath, page, extension)` path validation and zero-padding behavior.
- Produces: `createDoujinshiThumbnailSrc(pagePath: string, page: number): string`.

- [ ] **Step 1: Write failing URL-helper tests**

Add the import and exact assertions:

```ts
import {
  createDoujinshiThumbnailSrc,
  createMangaPageSrc,
  // existing imports remain
} from "../src/lib/manga-reader";

test("creates zero-padded doujinshi thumbnail URLs", () => {
  expect(
    createDoujinshiThumbnailSrc(
      "/manga/witches-and-cigarettes/chapter-001",
      1,
    ),
  ).toBe(
    "/manga/witches-and-cigarettes/chapter-001/thumbnails/001.webp",
  );
  expect(
    createDoujinshiThumbnailSrc(
      "/manga/witches-and-cigarettes/chapter-001/",
      31,
    ),
  ).toBe(
    "/manga/witches-and-cigarettes/chapter-001/thumbnails/031.webp",
  );
});

test("rejects unsafe doujinshi thumbnail paths and page numbers", () => {
  expect(() =>
    createDoujinshiThumbnailSrc("/manga/../media/chapter-001", 1),
  ).toThrow("Expected a /manga page path");
  expect(() =>
    createDoujinshiThumbnailSrc("/manga/book/chapter-001", 0),
  ).toThrow("positive page number");
});
```

- [ ] **Step 2: Run the focused test and confirm the missing export fails**

Run: `bun test tests/manga-reader.test.ts`

Expected: FAIL because `createDoujinshiThumbnailSrc` is not exported.

- [ ] **Step 3: Implement one normalized chapter-path helper and the thumbnail helper**

Refactor the path validation used by `createMangaPageSrc` into a private helper, preserving its current errors, then add:

```ts
const paddedPageNumber = (page: number): string => {
  if (!Number.isInteger(page) || page <= 0) {
    throw new Error("Expected a positive page number.");
  }
  return String(page).padStart(3, "0");
};

export const createDoujinshiThumbnailSrc = (
  pagePath: string,
  page: number,
): string =>
  `${normalizeMangaPagePath(pagePath)}/thumbnails/${paddedPageNumber(page)}.webp`;
```

Make `createMangaPageSrc` use the same `normalizeMangaPagePath` and `paddedPageNumber` helpers so page and thumbnail URLs cannot diverge.

- [ ] **Step 4: Run the focused test**

Run: `bun test tests/manga-reader.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the URL contract and implementation plan**

```bash
git add src/lib/manga-reader.ts tests/manga-reader.test.ts docs/superpowers/plans/2026-08-25-doujinshi-thumbnail-generation.md
git commit -m "feat: define doujinshi thumbnail paths"
```

---

### Task 2: Atomic thumbnail planner and renderer

**Files:**
- Create: `src/lib/media/doujinshi-thumbnails.ts`
- Create: `tests/media-doujinshi-thumbnails.test.ts`

**Interfaces:**
- Consumes: `createDoujinshiThumbnailSrc`, `createMangaPageSrc`, `resolveMediaUrl`, Sharp, and filesystem metadata.
- Produces:
  - `doujinshiThumbnailWidth = 320`
  - `doujinshiThumbnailQuality = 70`
  - `DoujinshiThumbnailItem`
  - `planDoujinshiThumbnails(options, adapters?)`
  - `generateDoujinshiThumbnails(options, adapters?)`
  - `collectDoujinshiThumbnailItems(entries, root, series?)`

- [ ] **Step 1: Write failing planner and renderer tests**

Create a temporary media tree with Sharp-generated WebP source pages. Cover these exact cases:

```ts
test("renders verified 320px WebP thumbnails without enlarging narrow pages", async () => {
  // Create 1200x1800 and 200x300 WebP sources.
  // Run generateDoujinshiThumbnails({ items, dryRun: false, force: false }).
  // Assert generated === 2, failed === [], wide output is 320x480,
  // narrow output is 200x300, and both metadata.format values are "webp".
});

test("skips fresh valid thumbnails and regenerates stale invalid or forced ones", async () => {
  // Use controlled mtimes and an invalid destination.
  // Assert reasons are "fresh", "stale", "invalid", and "force" as applicable.
});

test("dry-run writes nothing", async () => {
  // Assert the plan says generate and the thumbnails directory is absent.
});

test("a failed render leaves no temporary or partial destination", async () => {
  // Inject renderThumbnail that throws after returning no bytes.
  // Assert failed has one item and neither destination nor `.tmp-` file exists.
});
```

- [ ] **Step 2: Run the new test and confirm the module is missing**

Run: `bun test tests/media-doujinshi-thumbnails.test.ts`

Expected: FAIL because `src/lib/media/doujinshi-thumbnails.ts` does not exist.

- [ ] **Step 3: Define the focused types and constants**

Use these public shapes:

```ts
export const doujinshiThumbnailWidth = 320;
export const doujinshiThumbnailQuality = 70;

export type DoujinshiThumbnailItem = {
  series: string;
  chapter: string;
  page: number;
  sourcePublicPath: string;
  destinationPublicPath: string;
  sourcePath: string;
  destinationPath: string;
};

export type DoujinshiThumbnailPlanItem = DoujinshiThumbnailItem & {
  action: "generate" | "skip";
  reason: "missing" | "stale" | "invalid" | "force" | "fresh";
};

export type DoujinshiThumbnailOptions = {
  items: DoujinshiThumbnailItem[];
  dryRun: boolean;
  force: boolean;
};

export type DoujinshiThumbnailResult = {
  plan: DoujinshiThumbnailPlanItem[];
  generated: number;
  skipped: number;
  failed: Array<{ item: DoujinshiThumbnailItem; message: string }>;
};
```

The adapters expose only what deterministic tests need: `lstatFile`, `inspectImage`, `renderThumbnail`, `writeFile`, `renameFile`, and `removeFile`, each defaulting to the real filesystem or Sharp behavior.

- [ ] **Step 4: Implement freshness planning**

For every item, require a regular non-symlink source. Treat an absent destination as `missing`; a non-WebP, unreadable, nonpositive, or wider-than-320 destination as `invalid`; an older valid destination as `stale`; forced work as `force`; and a valid destination at least as new as its source as `fresh`/`skip`.

Sort items by `destinationPublicPath` before planning so dry-run and output remain deterministic.

- [ ] **Step 5: Implement atomic rendering**

The real renderer must follow this sequence:

```ts
const output = await sharp(item.sourcePath)
  .resize({ width: doujinshiThumbnailWidth, withoutEnlargement: true })
  .webp({ quality: doujinshiThumbnailQuality })
  .toBuffer();

await mkdir(dirname(item.destinationPath), { recursive: true });
const temporary = `${item.destinationPath}.tmp-${randomUUID()}`;
try {
  await writeFile(temporary, output, { flag: "wx" });
  const metadata = await sharp(temporary).metadata();
  assertValidThumbnailMetadata(metadata, temporary);
  await rename(temporary, item.destinationPath);
} finally {
  await rm(temporary, { force: true });
}
```

Process planned items sequentially. Catch per-item render failures into `failed`, continue remaining items, and count only verified renamed outputs as generated.

- [ ] **Step 6: Implement content-backed item discovery**

`collectDoujinshiThumbnailItems(entries, root, series?)` must:

1. Map `mangaSeries` entries by slug and format.
2. Reject a requested missing slug or a requested non-doujinshi series.
3. Select available `mangaChapters` whose `series` maps to `format: doujinshi`.
4. Validate `pagePath`, `pageExtension`, and positive `pageCount`.
5. Use `createMangaPageSrc` and `createDoujinshiThumbnailSrc` for public URLs.
6. Use `resolveMediaUrl` for both physical paths.
7. Return items sorted by destination URL.

- [ ] **Step 7: Run the focused generator tests**

Run: `bun test tests/media-doujinshi-thumbnails.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the generator**

```bash
git add src/lib/media/doujinshi-thumbnails.ts tests/media-doujinshi-thumbnails.test.ts
git commit -m "feat: generate managed doujinshi thumbnails"
```

---

### Task 3: Backfill and repair CLI

**Files:**
- Modify: `src/lib/media/cli.ts`
- Modify: `scripts/media.ts`
- Modify: `package.json`
- Modify: `tests/media-cli.test.ts`

**Interfaces:**
- Consumes: `collectDoujinshiThumbnailItems` and `generateDoujinshiThumbnails` from Task 2.
- Produces: `parseThumbnailArgs(argv): ThumbnailArgs`, the `thumbnails` media subcommand, and `bun run media:thumbnails`.

- [ ] **Step 1: Write failing parser and package-script tests**

Add assertions for:

```ts
expect(parseMediaCommand(["thumbnails", "--dry-run"])).toEqual({
  command: "thumbnails",
  args: ["--dry-run"],
});
expect(parseThumbnailArgs([])).toEqual({
  series: undefined,
  dryRun: false,
  force: false,
});
expect(
  parseThumbnailArgs(["--series", "example-book", "--dry-run", "--force"]),
).toEqual({ series: "example-book", dryRun: true, force: true });
expect(() => parseThumbnailArgs(["--series", "../book"])).toThrow(
  "lowercase letters, numbers, and hyphens",
);
expect(() => parseThumbnailArgs(["--force", "--force"])).toThrow(
  "may only be specified once",
);
expect(() => parseThumbnailArgs(["unexpected"])).toThrow(
  "Unexpected thumbnails argument",
);
```

Also assert `package.json` contains:

```ts
expect(pkg.scripts["media:thumbnails"]).toBe(
  "bun scripts/media.ts thumbnails",
);
```

- [ ] **Step 2: Run the CLI test and confirm it fails**

Run: `bun test tests/media-cli.test.ts`

Expected: FAIL because the command and parser are absent.

- [ ] **Step 3: Add strict command parsing and help**

Extend `MediaCommand`, `commands`, `mediaHelp`, and add:

```ts
export type ThumbnailArgs = {
  series?: string;
  dryRun: boolean;
  force: boolean;
};

export const thumbnailHelp = `Usage:
  bun run media:thumbnails [--series <slug>] [--dry-run] [--force]`;
```

`parseThumbnailArgs` accepts each option at most once, validates the series with the existing slug pattern, requires a value after `--series`, and rejects every positional or unknown option.

- [ ] **Step 4: Add CLI execution**

In `scripts/media.ts`, add a `thumbnails(args)` handler that:

```ts
const options = parseThumbnailArgs(args);
const root = requireMediaRoot();
const entries = await loadMediaContentEntries(process.cwd());
const items = collectDoujinshiThumbnailItems(entries, root, options.series);
const result = await generateDoujinshiThumbnails({
  items,
  dryRun: options.dryRun,
  force: options.force,
});
```

Dry-run output lists `GENERATE` and `SKIP` source-to-destination actions. Normal output reports selected pages, generated, skipped, and failed counts. Print every failure with its source public path and set `process.exitCode = mediaExitCodes.optimization` when failures exist.

Handle `thumbnails --help` without requiring `MEDIA_ROOT`, matching other subcommands.

- [ ] **Step 5: Run the focused CLI test**

Run: `bun test tests/media-cli.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the command**

```bash
git add src/lib/media/cli.ts scripts/media.ts package.json tests/media-cli.test.ts
git commit -m "feat: add doujinshi thumbnail backfill command"
```

---

### Task 4: Transactional doujinshi-import generation

**Files:**
- Modify: `src/lib/media/batch-import.ts`
- Modify: `tests/media-batch-import.test.ts`

**Interfaces:**
- Consumes: `generateDoujinshiThumbnails` and `DoujinshiThumbnailItem` from Task 2.
- Produces: automatic derivative generation inside staged doujinshi creates and replacements.

- [ ] **Step 1: Extend the batch-import test with an injected generator**

Add a `fakeGenerateThumbnails` adapter that creates `thumbnails/<page>.webp` beneath every staged chapter and returns generated counts. Assert the create test publishes:

```ts
expect(
  (await readdir(join(mediaRoot, "manga/example/chapter-001"))).sort(),
).toEqual(["001.webp", "002.webp", "thumbnails"]);
expect(
  (await readdir(
    join(mediaRoot, "manga/example/chapter-001/thumbnails"),
  )).sort(),
).toEqual(["001.webp", "002.webp"]);
```

Add a failure case where the generator returns one failed page. Assert the import records the failure, publishes neither content nor media, and leaves the source archive untouched.

- [ ] **Step 2: Run the focused import test and confirm failure**

Run: `bun test tests/media-batch-import.test.ts`

Expected: FAIL because staged imports do not request thumbnail generation.

- [ ] **Step 3: Add the adapter and staged items**

Extend `BatchImportAdapters` with:

```ts
generateThumbnails?: typeof generateDoujinshiThumbnails;
```

After each reader optimization, map `optimized.plan.items` into `DoujinshiThumbnailItem` values. Sources are staged reader outputs; destinations are the staged chapter's `thumbnails` directory; public paths use the final `/manga/<slug>/<chapter>/...` URLs.

- [ ] **Step 4: Generate before staged activation**

Call the injected or real generator with `{ items, dryRun: false, force: true }`. If `failed.length > 0`, throw an error naming the first failed public source and the total failure count. Do this before recording chapter content or activating staged media.

Do not invoke the generator from `stageImageSet` or `importMangaVolumes`.

- [ ] **Step 5: Run the focused import test**

Run: `bun test tests/media-batch-import.test.ts`

Expected: PASS, including existing rollback coverage.

- [ ] **Step 6: Commit import integration**

```bash
git add src/lib/media/batch-import.ts tests/media-batch-import.test.ts
git commit -m "feat: generate thumbnails during doujinshi imports"
```

---

### Task 5: Managed references and strict validation

**Files:**
- Modify: `src/lib/media/references.ts`
- Modify: `src/lib/media/validator.ts`
- Modify: `tests/media-references.test.ts`
- Modify: `tests/media-validator.test.ts`

**Interfaces:**
- Consumes: `createDoujinshiThumbnailSrc` and `doujinshiThumbnailWidth`.
- Produces: `thumbnails[<page>]` managed references and thumbnail-dimension validation errors.

- [ ] **Step 1: Write failing doujinshi-reference tests**

Update the main reference fixture to include a published doujinshi series and make the chapter reference it. Expect reader pages followed by:

```ts
"/manga/book/chapter-001/thumbnails/001.webp",
"/manga/book/chapter-001/thumbnails/002.webp",
```

Add separate assertions that identical chapter metadata produces no thumbnail references when the parent format is `manga`, and that unavailable doujinshi chapters produce neither reader nor thumbnail references.

- [ ] **Step 2: Write failing validator metadata tests**

Provide thumbnail references with snapshot inspections for:

- valid `webp`, width 320, positive height: no error;
- width 321: `thumbnail-dimensions` error;
- missing width or height: `thumbnail-dimensions` error;
- JPEG bytes at a `.webp` URL: existing `format-mismatch` error;
- an unreferenced file inside `thumbnails`: existing orphan warning.

- [ ] **Step 3: Run the focused tests and confirm failure**

Run: `bun test tests/media-references.test.ts tests/media-validator.test.ts`

Expected: FAIL because thumbnail references and dimension checks are absent.

- [ ] **Step 4: Expand references only through parent format**

Build a series-format map once at the start of `collectManagedMediaReferences`. Pass it into reader-reference collection. When the published available chapter's `series` maps to `doujinshi`, append:

```ts
{
  source: entry.path,
  field: `thumbnails[${index + 1}]`,
  publicPath: createDoujinshiThumbnailSrc(base, index + 1),
}
```

Do not infer doujinshi status from filenames, tags, or directories.

- [ ] **Step 5: Validate thumbnail metadata**

Extend `MediaValidationIssue["code"]` with `thumbnail-dimensions`. Preserve width, height, mtime, device, inode, and animation fields when converting `MediaLibraryFile` into a `MediaFileInspection`. After generic format checks pass, apply thumbnail-specific validation when `reference.field` matches `/^thumbnails\[\d+\]$/`:

```ts
if (
  inspection.kind === "file" &&
  (inspection.width === undefined ||
    inspection.height === undefined ||
    inspection.width <= 0 ||
    inspection.height <= 0 ||
    inspection.width > doujinshiThumbnailWidth)
) {
  return {
    code: "thumbnail-dimensions",
    ...reference,
    message: `Thumbnail must be readable and no wider than ${doujinshiThumbnailWidth}px`,
  };
}
```

- [ ] **Step 6: Run focused references and validator tests**

Run: `bun test tests/media-references.test.ts tests/media-validator.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit validation integration**

```bash
git add src/lib/media/references.ts src/lib/media/validator.ts tests/media-references.test.ts tests/media-validator.test.ts
git commit -m "feat: validate published doujinshi thumbnails"
```

---

### Task 6: Switch only approved preview surfaces and document the command

**Files:**
- Modify: `src/components/DoujinshiPagePreview.astro`
- Modify: `src/components/MangaReader.astro`
- Modify: `tests/doujinshi-overview-preview.test.ts`
- Modify: `tests/doujinshi-reader-preview.test.ts`
- Modify: `tests/manga-reader.test.ts`
- Modify: `docs/agent-workflows.md`

**Interfaces:**
- Consumes: `createDoujinshiThumbnailSrc` from Task 1.
- Produces: preview-only derivative rendering and public workflow documentation.

- [ ] **Step 1: Make component-source tests require the thumbnail helper**

Change the overview expectation from `createMangaPageSrc` to `createDoujinshiThumbnailSrc`. In the reader-preview test, require the preview rail to call the thumbnail helper. Keep the existing manga-reader assertion that the full page stack contains:

```ts
createMangaPageSrc(chapter.data.pagePath!, page, chapter.data.pageExtension)
```

Add an assertion that `MangaSeriesCard.astro` still uses `series.data.cover.src` and does not import `createDoujinshiThumbnailSrc`.

- [ ] **Step 2: Run the three focused component tests and confirm failure**

Run: `bun test tests/doujinshi-overview-preview.test.ts tests/doujinshi-reader-preview.test.ts tests/manga-reader.test.ts`

Expected: FAIL because both previews still use full reader URLs.

- [ ] **Step 3: Switch the series preview grid**

In `DoujinshiPagePreview.astro`, replace the page-source import and image `src` call with:

```astro
import { createDoujinshiThumbnailSrc, getMangaChapterPages } from "../lib/manga-reader";

<img
  src={createDoujinshiThumbnailSrc(chapter.data.pagePath!, page)}
  ...
/>
```

Keep the anchor target, alt text, dimensions, lazy loading, decoding, and CSS unchanged.

- [ ] **Step 4: Switch only the reader rail**

Import both URL helpers in `MangaReader.astro`. Use `createDoujinshiThumbnailSrc` inside `.page-preview` and retain `createMangaPageSrc` inside `.page-stack`.

- [ ] **Step 5: Document the public workflow**

In `docs/agent-workflows.md`, add the command to the quick-choice table and a compact section containing:

```text
bun run media:thumbnails --dry-run
bun run media:thumbnails
bun run media:thumbnails --series <slug>
bun run media:thumbnails --series <slug> --force
```

State that it applies only to doujinshi, writes beneath `MEDIA_ROOT/manga`, and must be followed by `bun run media:validate` before synchronization.

- [ ] **Step 6: Run the focused component tests**

Run: `bun test tests/doujinshi-overview-preview.test.ts tests/doujinshi-reader-preview.test.ts tests/manga-reader.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit preview integration and documentation**

```bash
git add src/components/DoujinshiPagePreview.astro src/components/MangaReader.astro tests/doujinshi-overview-preview.test.ts tests/doujinshi-reader-preview.test.ts tests/manga-reader.test.ts docs/agent-workflows.md
git commit -m "feat: serve thumbnails in doujinshi previews"
```

---

### Task 7: Backfill, verify, synchronize, and push

**Files:**
- Verify repository changes from Tasks 1–6.
- Write generated files only beneath configured `MEDIA_ROOT/manga`.

**Interfaces:**
- Consumes: completed generator, CLI, importer, reference, validator, and component changes.
- Produces: a locally and remotely available derivative set plus a synchronized Git branch.

- [ ] **Step 1: Run the complete focused feature test set once**

```bash
bun test \
  tests/manga-reader.test.ts \
  tests/media-doujinshi-thumbnails.test.ts \
  tests/media-cli.test.ts \
  tests/media-batch-import.test.ts \
  tests/media-references.test.ts \
  tests/media-validator.test.ts \
  tests/doujinshi-overview-preview.test.ts \
  tests/doujinshi-reader-preview.test.ts
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Review the real backfill plan**

Run: `bun run media:thumbnails --dry-run`

Confirm every planned destination is beneath `/manga/<doujinshi>/<chapter>/thumbnails/`, no non-doujinshi path appears, and the reported page count matches the selected available doujinshi chapters.

- [ ] **Step 3: Generate the real managed derivatives**

Run: `bun run media:thumbnails`

Expected: zero failed pages. Generated thumbnails remain outside Git beneath `MEDIA_ROOT/manga`.

- [ ] **Step 4: Run final proportional verification once**

```bash
bun run media:validate
bun run astro check
```

Expected: validation reports zero errors and zero orphans; Astro reports zero errors.

- [ ] **Step 5: Review and synchronize the external media upload**

```bash
bun run media:sync --dry-run
bun run media:sync
```

Do not use `--prune`. Confirm the dry run contains only expected new or changed thumbnail files before the real upload.

- [ ] **Step 6: Inspect the exact repository change set**

```bash
git status --short
git diff --check
git log --oneline -7
```

Confirm no generated image binary appears in Git and all feature changes are committed. If a small final correction is required, make it, rerun only its affected focused test, and commit it explicitly.

- [ ] **Step 7: Push the completed main branch**

Run: `git push origin main`

Expected: the remote accepts all design and implementation commits and reports `main` synchronized.
