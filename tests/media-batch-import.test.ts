import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import type { OptimizeOptions, OptimizeResult } from "../src/lib/media/optimizer";
import {
  formatBatchImportResult,
  importMediaBatch,
} from "../src/lib/media/batch-import";

const fakeOptimize = async (options: OptimizeOptions): Promise<OptimizeResult> => {
  expect(options.webReader).toBe(true);
  await mkdir(options.destination, { recursive: true });
  const sources = (await readdir(options.source))
    .map((name) => join(options.source, name))
    .sort();
  const items = [];
  for (let index = 0; index < sources.length; index += 1) {
    const outputRelativePath = `${String(index + 1).padStart(3, "0")}.webp`;
    await writeFile(join(options.destination, outputRelativePath), `webp-${index + 1}`);
    items.push({
      sourcePath: sources[index]!,
      sourceRelativePath: basename(sources[index]!),
      outputRelativePath,
      format: "jpeg" as const,
      action: "convert" as const,
      bytes: 1,
    });
  }
  return {
    plan: {
      source: options.source,
      destination: options.destination,
      profile: options.profile,
      quality: options.quality,
      items,
      ignored: [],
      originalBytes: items.length,
    },
    converted: items.length,
    copied: 0,
    ignored: 0,
    failed: 0,
    originalBytes: items.length,
    optimizedBytes: items.length,
    savedBytes: 0,
  };
};

test("creates doujinshi and image-set entries while preserving source archives", async () => {
  const root = await mkdtemp(join(tmpdir(), "batch-import-"));
  const source = join(root, "source");
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  const manifest = join(root, "batch.yaml");
  await mkdir(source);
  await mkdir(projectRoot);
  await mkdir(mediaRoot);
  await writeFile(join(source, "Book.zip"), "original-book");
  await writeFile(join(source, "Gallery.zip"), "original-gallery");
  await writeFile(manifest, `
version: 1
defaults: { ignoreEntries: [] }
entries:
  - type: doujinshi
    archive: Book.zip
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
  - type: image-set
    archive: Gallery.zip
    mode: create
    imageSet:
      slug: gallery
      title: Gallery
      summary: Gallery summary.
      publishedAt: 2025-11-15
      rating: explicit
      tags: [imageset]
      spheres: [anime]
      featured: false
`);
  const adapters = {
    listEntries: async (archive: string) =>
      basename(archive) === "Book.zip"
        ? [{ path: "1.jpg", isDirectory: false }, { path: "2.jpg", isDirectory: false }]
        : [{ path: "1.jpg", isDirectory: false }, { path: "2.jpg", isDirectory: false }],
    inspectEntry: async () => "jpeg" as const,
    extractEntry: async (_archive: string, entry: { path: string }, destination: string) => {
      await mkdir(join(destination, ".."), { recursive: true });
      await writeFile(destination, entry.path);
    },
    optimize: fakeOptimize,
    dimensions: async () => ({ width: 1200, height: 1700 }),
  };
  try {
    const dryRun = await importMediaBatch(
      { source, manifest, quality: 85, dryRun: true, status: "published", projectRoot, mediaRoot },
      adapters,
    );
    const preview = formatBatchImportResult(dryRun);
    expect(preview).toContain("CREATE example: chapter 1 = 2 pages");
    expect(preview).toContain("CREATE gallery: 2 images");
    expect(preview).toContain(join(mediaRoot, "manga/example"));

    const result = await importMediaBatch(
      { source, manifest, quality: 85, dryRun: false, status: "published", projectRoot, mediaRoot },
      adapters,
    );
    expect(result.created).toBe(2);
    expect(result.failed).toHaveLength(0);
    expect((await readdir(join(mediaRoot, "manga/example/chapter-001"))).sort()).toEqual([
      "001.webp",
      "002.webp",
    ]);
    expect(await readFile(join(projectRoot, "src/content/manga/series/example.md"), "utf8"))
      .toContain("format: doujinshi");
    const gallery = await readFile(join(projectRoot, "src/content/image-sets/gallery.md"), "utf8");
    expect(gallery.match(/src: \/media\/images\/gallery\//g)).toHaveLength(2);
    expect(await readFile(join(source, "Book.zip"), "utf8")).toBe("original-book");

    const rerun = await importMediaBatch(
      { source, manifest, quality: 85, dryRun: false, status: "published", projectRoot, mediaRoot },
      adapters,
    );
    expect(rerun.alreadyComplete).toBe(2);
    expect(rerun.created).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("restores existing chapter content and media when replacement activation fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "batch-replace-"));
  const source = join(root, "source");
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  const manifest = join(root, "batch.yaml");
  const series = "existing";
  await mkdir(source);
  await mkdir(join(projectRoot, "src/content/manga/series"), { recursive: true });
  await mkdir(join(projectRoot, "src/content/manga/chapters"), { recursive: true });
  await mkdir(join(mediaRoot, "manga/existing/chapter-001"), { recursive: true });
  await writeFile(join(source, "Existing.zip"), "original");
  await writeFile(join(projectRoot, "src/content/manga/series/existing.md"), "series-preserved");
  const oldChapter = "---\nslug: existing-chapter-001\nseries: existing\nnumber: 1\ntitle: Old\nstatus: published\n---\n\nOld body.\n";
  await writeFile(join(projectRoot, "src/content/manga/chapters/existing-chapter-001.md"), oldChapter);
  await writeFile(join(mediaRoot, "manga/existing/chapter-001/001.webp"), "old-page");
  await writeFile(manifest, `
version: 1
defaults: { ignoreEntries: [] }
entries:
  - type: doujinshi
    archive: Existing.zip
    mode: update
    series: existing
    replace: true
    chapters: [{ number: 1, title: New, pages: all }]
`);
  try {
    const result = await importMediaBatch(
      { source, manifest, quality: 85, dryRun: false, status: "published", projectRoot, mediaRoot },
      {
        listEntries: async () => [{ path: "1.jpg", isDirectory: false }],
        inspectEntry: async () => "jpeg",
        extractEntry: async (_archive, entry, destination) => writeFile(destination, entry.path),
        optimize: fakeOptimize,
        dimensions: async () => ({ width: 900, height: 1200 }),
        afterActivation: () => {
          throw new Error("forced activation failure");
        },
      },
    );
    expect(result.failed[0]?.message).toContain("forced activation failure");
    expect(await readFile(join(mediaRoot, "manga/existing/chapter-001/001.webp"), "utf8"))
      .toBe("old-page");
    expect(await readFile(join(projectRoot, "src/content/manga/chapters/existing-chapter-001.md"), "utf8"))
      .toBe(oldChapter);
    expect(await readFile(join(projectRoot, "src/content/manga/series/existing.md"), "utf8"))
      .toBe("series-preserved");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
