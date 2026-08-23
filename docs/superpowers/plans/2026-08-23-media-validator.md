# Media Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fast standalone validator that reads published Markdown content, verifies all managed external media, and reports orphaned files without running an Astro build.

**Architecture:** A Bun-native content loader splits frontmatter and parses YAML without importing Astro’s virtual `astro:content` module. A reference collector normalizes published frontmatter/body/chapter references, and a filesystem validator caches header inspection per file while comparing the published reference set with both managed media trees.

**Tech Stack:** Bun 1.2.20+ (`Bun.Glob`, `Bun.YAML`), TypeScript 5.9, Node filesystem/path APIs, Bun test.

**Spec:** `docs/superpowers/specs/2026-08-23-unified-media-cli-design.md`

## Global Constraints

- `media:validate` must not invoke `astro build`, `astro check`, or another full-site command.
- Only published content produces required media references; manga series use `visibility`, while other collections use `status`.
- Managed public paths are only `/manga/*` and `/media/images/*`.
- Unavailable metadata may remain published without media fields; archived/draft chapters do not require reader files.
- Missing, unsafe, malformed, unsupported, corrupt, or extension-mismatched managed media are errors.
- Files in managed trees that are not referenced by published content are warnings.
- Exclude `MEDIA_ROOT/.astrosphere/` completely.
- Require the foundation and optimizer plans to be complete; reuse their configuration, path, and format detection interfaces.

---

### Task 1: Standalone content/frontmatter loading

**Files:**
- Create: `src/lib/media/content-source.ts`
- Create: `tests/media-content-source.test.ts`

**Interfaces:**
- Produces: `MediaContentCollection`, `MediaContentEntry`, `parseContentDocument(source, path, collection)`, `collectionForContentPath(relativePath)`, `isPublishedMediaEntry(entry)`, and `loadMediaContentEntries(repoRoot?)`.
- Consumes: Bun YAML parsing and repository Markdown/MDX files; no Astro runtime imports.

- [ ] **Step 1: Write failing parsing and publication tests**

```ts
import { expect, test } from "bun:test";
import { collectionForContentPath, isPublishedMediaEntry, parseContentDocument } from "../src/lib/media/content-source";

test("parses YAML frontmatter and preserves the body", () => {
  const entry = parseContentDocument("---\nslug: example\nstatus: published\nhero:\n  src: /media/images/example/cover.webp\n---\n![Page](/media/images/example/001.webp)\n", "src/content/image-sets/example.md", "imageSets");
  expect(entry.data).toMatchObject({ slug: "example", status: "published" });
  expect(entry.body).toContain("![Page]");
});

test("maps repository content paths and publication fields", () => {
  expect(collectionForContentPath("manga/series/example.md")).toBe("mangaSeries");
  expect(collectionForContentPath("manga/chapters/example-001.md")).toBe("mangaChapters");
  expect(collectionForContentPath("image-sets/example.md")).toBe("imageSets");
  expect(isPublishedMediaEntry({ collection: "mangaSeries", path: "x", data: { slug: "x", visibility: "published" }, body: "" })).toBe(true);
  expect(isPublishedMediaEntry({ collection: "mangaChapters", path: "x", data: { slug: "x", status: "archived" }, body: "" })).toBe(false);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test tests/media-content-source.test.ts`

Expected: FAIL because `content-source.ts` does not exist.

- [ ] **Step 3: Implement strict frontmatter splitting**

```ts
export type MediaContentCollection = "artifacts" | "imageSets" | "mangaSeries" | "mangaChapters" | "pages" | "signals" | "spheres" | "trails";
export type MediaContentEntry = {
  collection: MediaContentCollection;
  path: string;
  data: Record<string, unknown>;
  body: string;
};
```

Require an opening `---` line and the next standalone `---` closing line. Parse only the enclosed text with `Bun.YAML.parse()`, require a non-array object and nonempty string `slug`, and include the file path in syntax/type errors. Preserve all text after the closing delimiter as `body`.

- [ ] **Step 4: Implement collection discovery**

Use `Bun.Glob("src/content/**/*.{md,mdx}")` and map first path segments explicitly. Treat every nested `artifacts/**` file as `artifacts`. Reject unexpected files under `src/content/manga/` rather than assigning a guessed collection. Sort discovered paths before reading so diagnostics are stable.

- [ ] **Step 5: Test a temporary repository tree**

Add a test using `mkdtemp()` that writes one published image set, one archived manga chapter, and one published artifact. Assert `loadMediaContentEntries(root)` returns all three in sorted path order and publication filtering identifies only the published entries.

- [ ] **Step 6: Run focused tests**

Run: `bun test tests/media-content-source.test.ts`

Expected: all parsing, mapping, and discovery tests pass.

- [ ] **Step 7: Commit the standalone loader**

```bash
git add src/lib/media/content-source.ts tests/media-content-source.test.ts
git commit -m "feat: load media references without Astro build"
```

---

### Task 2: Published managed-reference collection

**Files:**
- Create: `src/lib/media/references.ts`
- Create: `tests/media-references.test.ts`

**Interfaces:**
- Consumes: `MediaContentEntry`, `isPublishedMediaEntry()`, and `isManagedMediaUrl()`.
- Produces: `MediaReference`, `collectManagedMediaReferences(entries): MediaReference[]`.

- [ ] **Step 1: Write failing frontmatter, body, and reader tests**

```ts
import { expect, test } from "bun:test";
import { collectManagedMediaReferences } from "../src/lib/media/references";

test("collects managed frontmatter, Markdown, HTML, and reader pages", () => {
  const references = collectManagedMediaReferences([
    {
      collection: "imageSets", path: "set.md", body: '<img src="/media/images/set/002.webp">\n![One](/media/images/set/001.webp)',
      data: { slug: "set", status: "published", hero: { src: "/media/images/set/cover.webp" } },
    },
    {
      collection: "mangaChapters", path: "chapter.md", body: "",
      data: { slug: "chapter", status: "published", pagePath: "/manga/book/chapter-001", pageExtension: "webp", pageCount: 2 },
    },
  ]);
  expect(references.map(({ publicPath }) => publicPath)).toEqual([
    "/media/images/set/cover.webp",
    "/media/images/set/001.webp",
    "/media/images/set/002.webp",
    "/manga/book/chapter-001/001.webp",
    "/manga/book/chapter-001/002.webp",
  ]);
});

test("does not require media referenced only by archived entries", () => {
  expect(collectManagedMediaReferences([{ collection: "mangaChapters", path: "old.md", body: "", data: { slug: "old", status: "archived", pagePath: "/manga/old", pageExtension: "webp", pageCount: 1 } }])).toEqual([]);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test tests/media-references.test.ts`

Expected: FAIL because `references.ts` does not exist.

- [ ] **Step 3: Implement recursive frontmatter collection**

```ts
export type MediaReference = { source: string; field: string; publicPath: string };
```

For each published entry, recursively traverse frontmatter objects/arrays. Record string values only when their field name is `src` or `poster` and `isManagedMediaUrl(value)` is true. Use stable fields such as `hero.src`, `media[0].src`, and `art[1].src`. Do not collect arbitrary strings such as summaries.

- [ ] **Step 4: Implement body and reader expansion**

Collect root-relative managed paths from Markdown image syntax and HTML `src="..."`/`src='...'` attributes. For published manga chapters, require a managed `pagePath`, integer `pageCount > 0`, and extension `jpg|jpeg|png|webp`; emit one padded page reference per index. Sort each entry’s frontmatter, Markdown, HTML, and reader references into deterministic field/path order and deduplicate identical `{source, field, publicPath}` triples.

- [ ] **Step 5: Run focused tests**

Run: `bun test tests/media-references.test.ts`

Expected: all publication and reference-expansion tests pass.

- [ ] **Step 6: Commit reference collection**

```bash
git add src/lib/media/references.ts tests/media-references.test.ts
git commit -m "feat: collect published external media references"
```

---

### Task 3: Filesystem validation and orphan reporting

**Files:**
- Create: `src/lib/media/validator.ts`
- Create: `tests/media-validator.test.ts`

**Interfaces:**
- Consumes: `MediaReference`, `getMediaLayout()`, `resolveMediaUrl()`, and `detectImageFormat()`.
- Produces: `MediaValidationIssue`, `MediaOrphan`, `MediaValidationReport`, `validateMedia(options): Promise<MediaValidationReport>`, and `formatMediaValidationReport(report): string`.

- [ ] **Step 1: Write failing missing/format tests**

```ts
import { expect, test } from "bun:test";
import { validateMedia } from "../src/lib/media/validator";

test("reports missing referenced files once per source field", async () => {
  const report = await validateMedia({
    root: "/media",
    references: [{ source: "mangaChapters:one", field: "pages[1]", publicPath: "/manga/one/001.webp" }],
    walkManagedFiles: async () => [],
    inspectFile: async () => ({ kind: "missing" }),
  });
  expect(report.errors[0]).toMatchObject({ code: "missing", publicPath: "/manga/one/001.webp" });
});

test("reports extension/content mismatches and unknown headers", async () => {
  const references = [{ source: "imageSets:set", field: "media[0].src", publicPath: "/media/images/set/a.webp" }];
  const mismatch = await validateMedia({ root: "/media", references, walkManagedFiles: async () => ["/media/images/set/a.webp"], inspectFile: async () => ({ kind: "file", format: "png", bytes: 10 }) });
  expect(mismatch.errors[0]?.code).toBe("format-mismatch");
});
```

- [ ] **Step 2: Write failing orphan and private-directory tests**

Using a temporary `MEDIA_ROOT`, create referenced `manga/book/001.webp`, orphaned `images/set/unused.gif`, and `.astrosphere/prune.json`. Assert only the GIF is returned in `orphans`, the operation record is absent from all counts, and duplicate references inspect the WebP file once through a counting adapter.

- [ ] **Step 3: Run validator tests and confirm failure**

Run: `bun test tests/media-validator.test.ts`

Expected: FAIL because `validator.ts` does not exist.

- [ ] **Step 4: Implement bounded inspection and caching**

```ts
export type MediaValidationIssue = { code: "missing" | "unsafe" | "unsupported" | "corrupt" | "format-mismatch"; source: string; field: string; publicPath: string; message: string };
export type MediaOrphan = { publicPath: string; filePath: string; bytes: number };
export type MediaValidationReport = { references: number; files: number; errors: MediaValidationIssue[]; orphans: MediaOrphan[] };
```

Default inspection uses `lstat()` and rejects non-regular files. Read at most 32 bytes and call `detectImageFormatFromBytes()`. Treat `unknown` or headers shorter than the format’s minimum signature as corrupt/unsupported. Compare detected format with the public extension (`jpg` and `jpeg` are equivalent). Cache inspection promises by absolute path.

- [ ] **Step 5: Implement managed-tree walking and comparison**

Walk only `layout.manga` and `layout.images`, never follow symlinks, convert each regular path back to its public URL, and sort it. Validate every discovered file’s basic header even when orphaned. Report an unreferenced valid file as a warning entry. Report an unreferenced invalid file as an error and do not duplicate it as an orphan.

`formatMediaValidationReport()` prints errors first, orphan warnings second, and finishes with exactly `References: N | Files: N | Errors: N | Orphans: N`.

- [ ] **Step 6: Run validator tests**

Run: `bun test tests/media-validator.test.ts tests/media-references.test.ts tests/media-content-source.test.ts`

Expected: all focused tests pass.

- [ ] **Step 7: Commit standalone validation**

```bash
git add src/lib/media/validator.ts tests/media-validator.test.ts
git commit -m "feat: validate managed media and report orphans"
```

---

### Task 4: `media:validate` CLI integration

**Files:**
- Modify: `src/lib/media/cli.ts`
- Modify: `scripts/media.ts`
- Modify: `package.json`
- Modify: `tests/media-cli.test.ts`

**Interfaces:**
- Consumes: `loadMediaContentEntries()`, `collectManagedMediaReferences()`, `validateMedia()`, and `formatMediaValidationReport()`.
- Produces: the `media:validate` package command and exit behavior.

- [ ] **Step 1: Add failing CLI contract tests**

Assert `parseValidateArgs([])` returns an empty options object, any positional/unknown option throws, and `package.json` contains `"media:validate": "bun scripts/media.ts validate"`.

- [ ] **Step 2: Run the CLI test and confirm failure**

Run: `bun test tests/media-cli.test.ts`

Expected: FAIL because validation dispatch is absent.

- [ ] **Step 3: Implement validation dispatch**

The `validate` handler must:

```ts
const root = requireMediaRoot();
const entries = await loadMediaContentEntries(process.cwd());
const references = collectManagedMediaReferences(entries);
const report = await validateMedia({ root, references });
console.log(formatMediaValidationReport(report));
if (report.errors.length > 0) process.exitCode = mediaExitCodes.validation;
```

Orphans alone leave exit status `0`. Configuration errors use exit `3`; content parse and validation errors use exit `4` through `MediaError`/`mediaExitCodes`.

- [ ] **Step 4: Prove the command does not build Astro**

Add a source test asserting `scripts/media.ts` contains no `astro build`, `bun run build`, `MANGA_VALIDATE_EXTERNAL`, or `IMAGE_SET_VALIDATE_EXTERNAL`. Run `bun run media:validate` with `MEDIA_ROOT` set to a deliberately empty temporary root and expect a fast nonzero report listing missing managed references rather than starting an Astro build.

- [ ] **Step 5: Run all validator and CLI tests**

Run: `bun test tests/media-content-source.test.ts tests/media-references.test.ts tests/media-validator.test.ts tests/media-cli.test.ts`

Expected: all focused tests pass.

- [ ] **Step 6: Commit validator CLI integration**

```bash
git add src/lib/media/cli.ts scripts/media.ts package.json tests/media-cli.test.ts
git commit -m "feat: expose standalone media validation"
```

---

### Task 5: Validator regression gate

**Files:**
- Modify only if a regression is found in files owned by this plan.

**Interfaces:**
- Produces a passing baseline for synchronization and legacy cleanup.

- [ ] **Step 1: Run the full unit suite**

Run: `bun test`

Expected: all tests pass.

- [ ] **Step 2: Run Astro checks**

Run: `bun run astro check`

Expected: zero errors, warnings, and hints.

- [ ] **Step 3: Confirm a clean feature branch**

Run: `git status --short --branch`

Expected: clean `codex/unified-media-workflow` checkout.
