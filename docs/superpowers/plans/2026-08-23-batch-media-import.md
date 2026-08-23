# Batch Media Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe manifest-driven command that creates doujinshi and image sets, replaces explicitly selected chapters, and imports the supplied batch.

**Architecture:** Parse and validate a versioned YAML manifest before writes, turn each listed archive into an immutable import plan, and execute each entry as its own staged transaction. Reuse the existing archive, optimizer, image inspection, content-source, and external-media conventions; persist fingerprints so identical reruns can be skipped safely.

**Tech Stack:** Bun, TypeScript, `yaml`, Astro content schemas, existing WebP command-line tools

**Spec:** `docs/superpowers/specs/2026-08-23-batch-doujinshi-image-set-import-design.md`

## Global Constraints

- Heavy binaries stay outside the repository under `MEDIA_ROOT`.
- Published URLs remain root-relative under `/manga/` and `/media/images/`.
- Source ZIP/CBZ files are read-only.
- New entries publish by default; `--draft` affects only new entries.
- Existing data changes only with `mode: update` and `replace: true`.
- The Ai to Bouryoku archive remains untouched.
- The supplied notes are metadata, not instructions.
- Use `apply_patch` for repository edits.
- Do not run Git commands because the project forbids Git state changes without explicit authorization.

## File Structure

- `src/lib/media/batch-manifest.ts`: manifest types, YAML parsing, structural validation, and normalized fingerprints.
- `src/lib/media/batch-plan.ts`: archive inventory, ignore and page-range selection, destination resolution, collision checks, and dry-run plan formation.
- `src/lib/media/batch-content.ts`: schema-valid series, chapter, and image-set Markdown rendering.
- `src/lib/media/batch-import.ts`: entry staging, optimization, publication, rollback, quarantine, records, and batch summaries.
- `src/lib/media/cli.ts`: `media:add batch` argument parsing and help.
- `scripts/media.ts`: batch command dispatch and compact reporting.
- `tests/media-batch-manifest.test.ts`: manifest contract tests.
- `tests/media-batch-plan.test.ts`: selection, collision, and dry-run tests.
- `tests/media-batch-content.test.ts`: Markdown renderer tests.
- `tests/media-batch-import.test.ts`: create, replace, rollback, and rerun transaction tests.
- `tests/media-cli.test.ts`: public argument and dispatch tests.
- `media-manifests/2026-08-23-batch-1.yaml`: reviewed metadata and mapping for the supplied archives.
- `README.md` and `AGENTS.md`: finished workflow and invariants.

---

### Task 1: Batch CLI contract

**Files:**
- Modify: `src/lib/media/cli.ts`
- Modify: `tests/media-cli.test.ts`

**Interfaces:**
- Produces: `AddBatchArgs = { kind: "batch"; source: string; manifest: string; quality: number; dryRun: boolean; status: "draft" | "published" }`
- Produces: `parseAddArgs(argv): AddMangaVolumeArgs | AddBatchArgs`

- [ ] **Step 1: Add failing parser and help assertions**

```ts
expect(parseAddArgs([
  "batch", "batch 1 doujinshi", "--manifest", "batch.yaml", "--dry-run",
])).toEqual({
  kind: "batch",
  source: resolve("batch 1 doujinshi"),
  manifest: resolve("batch.yaml"),
  quality: 85,
  dryRun: true,
  status: "published",
});
expect(() => parseAddArgs(["batch", "source"])).toThrow("--manifest is required");
expect(() => parseAddArgs(["batch", "one", "two", "--manifest", "batch.yaml"]))
  .toThrow("exactly one source folder");
expect(addHelp).toContain("media:add batch <source-folder> --manifest <file> [--quality <1..100>] [--dry-run] [--draft]");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test tests/media-cli.test.ts`

Expected: FAIL because `batch` is not accepted.

- [ ] **Step 3: Add the discriminated batch argument parser**

```ts
export type AddBatchArgs = {
  kind: "batch";
  source: string;
  manifest: string;
  quality: number;
  dryRun: boolean;
  status: "draft" | "published";
};

export type AddArgs = AddMangaVolumeArgs | AddBatchArgs;
export const parseAddArgs = (argv: string[]): AddArgs => {
  const [kind, ...args] = argv;
  if (kind === "batch") return parseAddBatchArgs(args);
  if (kind === "manga-volume") return parseAddMangaVolumeArgs(args);
  throw new MediaError("usage", kind ? `Unknown add type: ${kind}` : addHelp);
};
```

`parseAddBatchArgs` accepts one positional source, requires one `--manifest`, shares the existing strict quality validation, and rejects duplicate `--dry-run`, `--draft`, `--quality`, and `--manifest` flags.

- [ ] **Step 4: Re-run the focused test**

Run: `bun test tests/media-cli.test.ts`

Expected: PASS.

### Task 2: Versioned manifest parsing and normalization

**Files:**
- Create: `src/lib/media/batch-manifest.ts`
- Create: `tests/media-batch-manifest.test.ts`

**Interfaces:**
- Produces: `BatchManifest`, `BatchEntry`, `DoujinshiEntry`, `ImageSetEntry`, and `PageSelection` types.
- Produces: `parseBatchManifest(source: string, path: string): BatchManifest`.
- Produces: `loadBatchManifest(path: string): Promise<BatchManifest>`.
- Produces: `fingerprintBatchEntry(entry: BatchEntry, archiveSha256: string): string`.

- [ ] **Step 1: Write failing contract tests**

```ts
test("parses a version 1 create manifest", () => {
  const parsed = parseBatchManifest(`
version: 1
defaults: { ignoreEntries: [ReadMe.txt, final.jpg] }
entries:
  - type: doujinshi
    archive: Example.zip
    mode: create
    series:
      slug: example
      title: Example
      originalTitle: Example
      aliases: []
      status: completed
      publicationYear: 2026
      description: Example description.
      rating: explicit
      origin: original
      tags: [english]
      authors: [{ name: Example, slug: example }]
      artists: [{ name: Example, slug: example }]
      featured: false
    chapters: [{ number: 1, title: Doujinshi, pages: all }]
`, "batch.yaml");
  expect(parsed.entries[0]?.type).toBe("doujinshi");
});

test("rejects unsafe and ambiguous manifests", () => {
  expect(() => parseBatchManifest("version: 2\nentries: []", "bad.yaml"))
    .toThrow("version must be 1");
  expect(() => parseBatchManifest(duplicateArchiveYaml, "bad.yaml"))
    .toThrow("archive is listed more than once");
  expect(() => parseBatchManifest(updateWithoutReplaceYaml, "bad.yaml"))
    .toThrow("replace: true");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/media-batch-manifest.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement strict parsing with local validation helpers**

```ts
export type PageSelection = "all" | { from: number; to: number };
export type BatchManifest = {
  version: 1;
  defaults: { ignoreEntries: string[] };
  entries: BatchEntry[];
};

export const parseBatchManifest = (source: string, path: string): BatchManifest => {
  const value = parseYaml(source);
  const root = requireRecord(value, path);
  requireExactKeys(root, ["version", "defaults", "entries"], path);
  if (root.version !== 1) throw new Error(`${path}: version must be 1`);
  const manifest = normalizeManifest(root, path);
  rejectDuplicateArchives(manifest.entries, path);
  rejectDuplicateSlugs(manifest.entries, path);
  return manifest;
};
```

Validation enumerates accepted keys at every object level, applies the existing slug/status/rating conventions, requires non-empty creators and chapters, validates positive chapter numbers and inclusive integer ranges, rejects overlapping ranges, and requires explicit replacement authorization for updates.

- [ ] **Step 4: Implement deterministic fingerprints**

```ts
export const fingerprintBatchEntry = (
  entry: BatchEntry,
  archiveSha256: string,
): string => createHash("sha256")
  .update(JSON.stringify(sortObjectKeys({ entry, archiveSha256 })))
  .digest("hex");
```

- [ ] **Step 5: Run the manifest tests**

Run: `bun test tests/media-batch-manifest.test.ts`

Expected: PASS.

### Task 3: Immutable archive plans and dry runs

**Files:**
- Create: `src/lib/media/batch-plan.ts`
- Create: `tests/media-batch-plan.test.ts`

**Interfaces:**
- Consumes: `BatchManifest`, `BatchEntry`, `ArchiveEntry`, `listZipEntries`, `detectImageFormat`.
- Produces: `BatchImportPlan` and `PlannedBatchEntry`.
- Produces: `planBatchImport(options, adapters?): Promise<BatchImportPlan>`.

- [ ] **Step 1: Write failing planning tests**

```ts
test("selects pages naturally after manifest ignores", async () => {
  const plan = await planBatchImport(options, {
    listEntries: async () => [
      file("10.webp"), file("2.webp"), file("final.jpg"), file("ReadMe.txt"),
    ],
    inspectEntry: async (entry) => entry.path.endsWith(".txt") ? "unknown" : "webp",
    pathExists: async () => false,
    hashFile: async () => "archive-hash",
  });
  expect(plan.entries[0]?.pages.map((page) => page.entry.path))
    .toEqual(["2.webp", "10.webp"]);
  expect(plan.entries[0]?.ignored).toEqual(["ReadMe.txt", "final.jpg"]);
});

test("dry planning refuses overlapping ranges and create collisions", async () => {
  await expect(planBatchImport(collidingOptions, collidingAdapters))
    .rejects.toThrow("already exists");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/media-batch-plan.test.ts`

Expected: FAIL because the planner does not exist.

- [ ] **Step 3: Implement full-folder preflight**

```ts
export type PlannedPage = { ordinal: number; entry: ArchiveEntry; format: SupportedInputFormat };
export type PlannedBatchEntry = {
  manifest: BatchEntry;
  archivePath: string;
  archiveSha256: string;
  fingerprint: string;
  pages: PlannedPage[];
  chapterPages: Map<number, PlannedPage[]>;
  ignored: string[];
  destinations: string[];
  state: "create" | "replace" | "already-complete";
};
```

The planner verifies the source is a directory; reports all unlisted ZIP/CBZ files; rejects missing listed archives, unsafe archive entries, non-image selected entries, duplicate portable output names, empty selections, gaps between explicit chapter ranges, and path collisions. It checks record fingerprints plus current output hashes before assigning `already-complete`. It performs no writes.

- [ ] **Step 4: Prove dry-run immutability**

Capture recursive project/media directory listings before and after `planBatchImport`; assert equality and assert no `.astrosphere/imports` path was created.

- [ ] **Step 5: Run planning tests**

Run: `bun test tests/media-batch-plan.test.ts`

Expected: PASS.

### Task 4: Content renderers

**Files:**
- Create: `src/lib/media/batch-content.ts`
- Create: `tests/media-batch-content.test.ts`

**Interfaces:**
- Produces: `renderDoujinshiSeries(entry, cover): string`.
- Produces: `renderDoujinshiChapter(entry, chapter, media): string`.
- Produces: `renderImageSet(entry, images): string`.

- [ ] **Step 1: Write failing renderer tests**

```ts
expect(parseFrontmatter(renderDoujinshiSeries(entry, cover))).toMatchObject({
  slug: "example",
  visibility: "published",
  format: "doujinshi",
  cover: { kind: "image", src: "/manga/example/cover.webp" },
});
expect(parseFrontmatter(renderImageSet(gallery, images))).toMatchObject({
  hero: { src: "/media/images/gallery/001.webp" },
  media: [{ src: "/media/images/gallery/002.webp" }],
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/media-batch-content.test.ts`

Expected: FAIL because renderers do not exist.

- [ ] **Step 3: Implement YAML-safe deterministic renderers**

```ts
const frontmatter = (data: Record<string, unknown>, body = ""): string =>
  `---\n${stringifyYaml(data, { lineWidth: 0 }).trimEnd()}\n---\n${body ? `\n${body.trim()}\n` : ""}`;

export const renderImageSet = (entry: ImageSetEntry, images: ImageInfo[]): string =>
  frontmatter({
    ...entry.imageSet,
    status: entry.visibility,
    layout: "gallery",
    hero: imageMedia(images[0]!, entry.imageSet.title, 1),
    media: images.slice(1).map((image, index) =>
      imageMedia(image, entry.imageSet.title, index + 2)),
  });
```

Renderers include verified first-page width and height for reader metadata, retain configured chapter bodies, use `Doujinshi` only as the absent-title default, and never duplicate the image-set hero in `media`.

- [ ] **Step 4: Run renderer tests**

Run: `bun test tests/media-batch-content.test.ts`

Expected: PASS.

### Task 5: Transactional entry execution

**Files:**
- Create: `src/lib/media/batch-import.ts`
- Create: `tests/media-batch-import.test.ts`

**Interfaces:**
- Consumes: `BatchImportPlan`, content renderers, `optimizeMedia`, and archive extraction helpers.
- Produces: `executeBatchImport(plan, options, adapters?): Promise<BatchImportResult>`.
- Produces: `importMediaBatch(options, adapters?): Promise<BatchImportResult>` combining load, plan, dry-run, and execute.

- [ ] **Step 1: Write failing create transaction tests**

Create temporary project/media roots and injected archive/optimizer adapters. Assert a doujinshi creates its series, chapter, cover, and reader pages; an image set creates one hero plus all remaining `media`; original archives remain byte-identical; and a forced renderer failure leaves no destination files.

```ts
expect(await readdir(join(mediaRoot, "manga/example/chapter-001")))
  .toEqual(["001.webp", "002.webp"]);
expect(await readFile(join(projectRoot, "src/content/manga/series/example.md"), "utf8"))
  .toContain("format: doujinshi");
expect(await Bun.file(sourceArchive).arrayBuffer()).toEqual(originalBytes);
```

- [ ] **Step 2: Write failing replacement and rollback tests**

Seed two old Futanari chapter directories and Markdown files. Assert successful replacement preserves series Markdown and quarantines old chapter data. Inject failure between chapter activation and validation; assert both old chapter directories and files are restored exactly.

- [ ] **Step 3: Run and confirm failure**

Run: `bun test tests/media-batch-import.test.ts`

Expected: FAIL because the executor does not exist.

- [ ] **Step 4: Implement per-entry staging and publication**

```ts
export const importMediaBatch = async (options: BatchImportOptions): Promise<BatchImportResult> => {
  const manifest = await loadBatchManifest(options.manifest);
  const plan = await planBatchImport({ ...options, manifest });
  if (options.dryRun) return resultFromPlan(plan);
  return executeBatchImport(plan, options);
};
```

For each actionable entry, create `MEDIA_ROOT/.astrosphere/imports/<operation-id>/<slug>/`, extract only planned entries using safe selectors, optimize reader or gallery staging, verify count/dimensions/WebP headers, render staged content, and then activate destinations. New content uses temporary siblings and exclusive rename. Replacement media moves to `.astrosphere/quarantine/<operation-id>/`, replacement content is copied there before atomic rewrite, and any failure runs a reverse-order rollback journal.

- [ ] **Step 5: Implement completion records and exact rerun checks**

```ts
type ImportRecord = {
  version: 1;
  slug: string;
  fingerprint: string;
  outputs: Array<{ path: string; sha256: string }>;
};
```

Write a record atomically only after validation. The planner skips only when fingerprint and every current output hash match; otherwise it refuses the collision.

- [ ] **Step 6: Run transaction tests**

Run: `bun test tests/media-batch-import.test.ts`

Expected: PASS.

### Task 6: Wire CLI execution and reporting

**Files:**
- Modify: `scripts/media.ts`
- Modify: `tests/media-cli.test.ts`

**Interfaces:**
- Consumes: `AddArgs`, `importMediaBatch`.
- Produces: stable dry-run and completion output.

- [ ] **Step 1: Add failing end-to-end CLI assertions**

```ts
expect(result.stdout).toContain("Batch import dry run");
expect(result.stdout).toContain("Create: 1 | Replace: 1 | Already complete: 0");
expect(result.stdout).toContain("Unlisted, not imported: ignored.zip");
expect(result.exitCode).toBe(0);
```

- [ ] **Step 2: Run and confirm failure**

Run: `bun test tests/media-cli.test.ts`

Expected: FAIL because `scripts/media.ts` always dispatches manga volumes.

- [ ] **Step 3: Dispatch by the parsed discriminator**

```ts
const options = parseAddArgs(args);
if (options.kind === "batch") {
  const result = await importMediaBatch({
    ...options,
    projectRoot: process.cwd(),
    mediaRoot: requireMediaRoot(),
  });
  console.log(formatBatchImportResult(result));
  return;
}
const result = await importMangaVolumes({
  ...options,
  projectRoot: process.cwd(),
  mediaRoot: requireMediaRoot(),
});
```

- [ ] **Step 4: Run CLI and all focused media tests**

Run: `bun test tests/media-cli.test.ts tests/media-batch-*.test.ts tests/media-manga-volume.test.ts tests/media-optimizer-plan.test.ts tests/media-optimizer-transaction.test.ts`

Expected: PASS.

### Task 7: Encode and preview the supplied batch

**Files:**
- Create: `media-manifests/2026-08-23-batch-1.yaml`

**Interfaces:**
- Consumes the approved manifest contract and supplied archives.
- Produces the reviewed 16-entry acceptance manifest.

- [ ] **Step 1: Encode the exact batch mapping**

Use these slugs and actions:

| Action | Slug | Pages | Year | Artist |
|---|---|---:|---:|---|
| replace | `futanari-akuma-san-to-hiruyasumi` | 39 + 4 | preserve | yukataro |
| create | `adventurers-by-day-freaky-friends-by-night` | 114 | 2025 | yukataro |
| create | `kyou-wa-watashi-ga-suru-tte-itta-no-ni` | 30 | 2023 | yukataro |
| create | `nishizumi-dono-ni-haete-shimatte-mo-aishite-orimasu` | 28 | 2019 | yukataro |
| create | `yasashiku-sawatte-oku-made-furete` | 31 | 2018 | yukataro |
| create | `futodokimono-no-tame-no-waltz` | 14 | 2026 | orihi-chihiro |
| create | `ending-the-divide-between-thought-and-action` | 18 | 2025 | orihi-chihiro |
| create | `yuri-kyuuji-youen-shujin-to-midara-na-maid` | 25 | 2026 | noyama |
| create | `i-started-futanari-activities` | 37 | 2026 | sella |
| create | `skeb-request-054-onee-loli-yuri` | 4 | 2023 | yukataro |
| create | `daiyojouhan-koujou-keikaku` | 30 | 2016 | yukataro |
| create | `penance-and-the-doctor` | 6 | 2026 | rapisu |
| create | `texas-uke-ft-pen-kyuu` | 5 | 2024 | rapisu |
| create | `blaze-translated-gallery` | 22 | 2026 | rapisu |
| create | `furooraito-no-shiikuretto-kyouyaku` | 43 | 2026 | karasu-chan |
| image-set create | `maiqo-patreon-collection-2022-2025-11` | 448 | 2025-11-15 | maiqo |

Use `sonotaozey`, `virophilia`, or `coscoteikoku` as author when supplied; otherwise use the artist for authored originals and `Unknown` for fanworks with no supplied group. Add `english` and `translated` tags where supplied, preserve parody/character/tag metadata as normalized slugs, set explicit rating, set `origin: fanwork` when a parody is supplied and `origin: original` otherwise. Omit the Ai archive entirely. Configure `[.DS_Store, ReadMe.txt, final.jpg]` as batch ignores. Configure Futanari chapter 1 as 1–39 and chapter 2 as 40–43 with `mode: update` and `replace: true`.

- [ ] **Step 2: Run the real dry run**

Run:

```text
MEDIA_ROOT=/Users/astrochan/Documents/Workstation/astrosphere-media bun run media:add batch "/Users/astrochan/Downloads/batch 1 doujinshi" --manifest media-manifests/2026-08-23-batch-1.yaml --dry-run
```

Expected: 14 creates, 1 replacement, 1 image-set create, 0 errors; Ai is reported unlisted; page counts match the table; no repository or media changes occur.

- [ ] **Step 3: Correct only manifest metadata or mappings exposed by preflight**

Repeat the same dry run until its counts exactly match the acceptance table. Do not weaken validation or add an archive to the manifest to silence a report.

### Task 8: Publish the supplied batch and verify the site

**Files:**
- Modify/create: `src/content/manga/series/*.md` generated by the importer
- Modify/create: `src/content/manga/chapters/*.md` generated by the importer
- Create: `src/content/image-sets/maiqo-patreon-collection-2022-2025-11.md` generated by the importer
- Modify/create: external `MEDIA_ROOT/manga/*` and `MEDIA_ROOT/images/*`
- Modify: `README.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Run the real import once**

Run the Task 7 command without `--dry-run`.

Expected: 14 doujinshi created, two Futanari chapters replaced, one 448-image set created, zero failed entries, and a recoverable quarantine path printed.

- [ ] **Step 2: Prove idempotent rerun behavior**

Run the same command again.

Expected: every completed create is `already complete`; the explicit replacement is also recognized as complete; no file timestamps or hashes change.

- [ ] **Step 3: Run focused and full verification**

Run:

```text
bun test tests/media-*.test.ts
MEDIA_ROOT=/Users/astrochan/Documents/Workstation/astrosphere-media bun run media:validate
bun run astro check
bun run build
```

Expected: all tests pass; media validation has zero errors; Astro check has zero errors; production build succeeds.

- [ ] **Step 4: Inspect representative pages locally**

Start the background dev server with `astro dev --background`. Verify the existing Futanari entry reads both replacement chapters, one newly created doujinshi opens its reader, and the maiqo image-set renders 448 unique images. Stop it with `astro dev stop` after inspection.

- [ ] **Step 5: Document the finished commands**

Add the batch preview/publish workflow, manifest safety rules, and future VPS note to `README.md`. Update `AGENTS.md` with the invariant that batch imports require reviewed manifests and replacements require explicit authorization.
