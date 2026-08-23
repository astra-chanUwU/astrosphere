import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OptimizeOptions, OptimizeResult } from "../src/lib/media/optimizer";
import {
  importMangaVolume,
  importMangaVolumes,
  resolveMangaVolumeSources,
  parseMangaVolumeEntries,
  parseWebpInfoDimensions,
  renderMangaChapter,
} from "../src/lib/media/manga-volume";

const entry = (path: string) => ({ path, isDirectory: false });

test("groups standard and numbered bonus chapters without losing pages", () => {
  const chapters = parseMangaVolumeEntries([
    entry("Title - c005#1 (v01) - p154.jpg"),
    entry("Title - c001 (v01) - p002-p003.jpg"),
    entry("Title - c005 (v01) - p127.jpg"),
    entry("Title - c001 (v01) - p001.jpg"),
  ]);

  expect(chapters.map(({ number, pathSegment }) => ({ number, pathSegment }))).toEqual([
    { number: 1, pathSegment: "chapter-001" },
    { number: 5, pathSegment: "chapter-005" },
    { number: 5.1, pathSegment: "chapter-005-1" },
  ]);
  expect(chapters[0]?.entries.map(({ path }) => path)).toEqual([
    "Title - c001 (v01) - p001.jpg",
    "Title - c001 (v01) - p002-p003.jpg",
  ]);
});

test("rejects archive files that cannot be assigned to a chapter", () => {
  expect(() => parseMangaVolumeEntries([entry("unlabelled-cover.jpg")])).toThrow(
    "cannot assign",
  );
});

test("parses WebP dimensions and renders published chapter content by default", () => {
  expect(
    parseWebpInfoDimensions("Chunk VP8\n  Width: 1200\n  Height: 1707\n"),
  ).toEqual({ width: 1200, height: 1707 });

  expect(
    renderMangaChapter({
      series: "android-series",
      number: 5.1,
      pathSegment: "chapter-005-1",
      pageCount: 19,
      pageWidth: 1200,
      pageHeight: 1707,
    }),
  ).toBe(`---
slug: android-series-chapter-005-1
series: android-series
number: 5.1
title: Chapter 5.1
pagePath: /manga/android-series/chapter-005-1
pageExtension: webp
pageCount: 19
pageWidth: 1200
pageHeight: 1707
readingDirection: rtl
status: published
---
`);
});

test("renders draft chapter content only when requested", () => {
  expect(
    renderMangaChapter(
      {
        series: "android-series",
        number: 1,
        pathSegment: "chapter-001",
        pageCount: 20,
        pageWidth: 1200,
        pageHeight: 1707,
      },
      "draft",
    ),
  ).toContain("status: draft");
});

test("expands archive folders in natural order and ignores other files", async () => {
  const root = await mkdtemp(join(tmpdir(), "manga-volume-sources-"));
  try {
    await writeFile(join(root, "volume-10.cbz"), "ten");
    await writeFile(join(root, "volume-2.zip"), "two");
    await writeFile(join(root, "notes.txt"), "ignore");

    expect(await resolveMangaVolumeSources([root])).toEqual([
      join(root, "volume-2.zip"),
      join(root, "volume-10.cbz"),
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("imports every discovered chapter while preserving the source", async () => {
  const root = await mkdtemp(join(tmpdir(), "manga-volume-import-"));
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  const source = join(root, "volume.cbz");
  const series = "android-series";
  const chapterEntries = [
    entry("Title - c001 (v01) - p001.jpg"),
    entry("Title - c001 (v01) - p002.jpg"),
    entry("Title - c001#1 (v01) - p003.jpg"),
  ];
  await mkdir(join(projectRoot, "src/content/manga/series"), { recursive: true });
  await mkdir(join(projectRoot, "src/content/manga/chapters"), { recursive: true });
  await mkdir(join(mediaRoot, "manga"), { recursive: true });
  await writeFile(join(projectRoot, "src/content/manga/series/android-series.md"), "---\nslug: android-series\n---\n");
  await writeFile(source, "original archive");

  const optimize = async (options: OptimizeOptions): Promise<OptimizeResult> => {
    await mkdir(options.destination);
    const sources = (await readdir(options.source)).sort();
    for (let index = 0; index < sources.length; index += 1) {
      await writeFile(join(options.destination, `${String(index + 1).padStart(3, "0")}.webp`), "webp");
    }
    return {
      plan: {
        source: options.source,
        destination: options.destination,
        profile: "reader",
        quality: options.quality,
        items: sources.map((name, index) => ({
          sourcePath: join(options.source, name),
          sourceRelativePath: name,
          outputRelativePath: `${String(index + 1).padStart(3, "0")}.webp`,
          format: "jpeg",
          action: "convert",
          bytes: 1,
        })),
        ignored: [],
        originalBytes: sources.length,
      },
      converted: sources.length,
      copied: 0,
      ignored: 0,
      failed: 0,
      originalBytes: sources.length,
      optimizedBytes: sources.length,
      savedBytes: 0,
    };
  };

  try {
    const result = await importMangaVolume(
      { source, series, quality: 85, projectRoot, mediaRoot },
      {
        listEntries: async () => chapterEntries,
        extractEntry: async (_archive, archiveEntry, destination) =>
          writeFile(destination, archiveEntry.path),
        optimize,
        dimensions: async () => ({ width: 1200, height: 1707 }),
      },
    );

    expect(result.chapters.map(({ number, pageCount }) => ({ number, pageCount }))).toEqual([
      { number: 1, pageCount: 2 },
      { number: 1.1, pageCount: 1 },
    ]);
    expect(
      (await readdir(join(mediaRoot, "manga/android-series/chapter-001"))).sort(),
    ).toEqual(["001.webp", "002.webp"]);
    expect(
      await readFile(
        join(projectRoot, "src/content/manga/chapters/android-series-chapter-001-1.md"),
        "utf8",
      ),
    ).toContain("status: published");
    expect(await readFile(source, "utf8")).toBe("original archive");

    let duplicateError: unknown;
    try {
      await importMangaVolume(
        { source, series, quality: 85, projectRoot, mediaRoot },
        { listEntries: async () => chapterEntries },
      );
    } catch (error) {
      duplicateError = error;
    }
    expect(duplicateError).toBeInstanceOf(Error);
    expect((duplicateError as Error).message).toContain("already exists");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("imports every archive discovered in a supplied folder", async () => {
  const root = await mkdtemp(join(tmpdir(), "manga-volume-batch-"));
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  const sourceRoot = join(root, "archives");
  const series = "android-series";
  await mkdir(join(projectRoot, "src/content/manga/series"), { recursive: true });
  await mkdir(join(projectRoot, "src/content/manga/chapters"), { recursive: true });
  await mkdir(join(mediaRoot, "manga"), { recursive: true });
  await mkdir(sourceRoot);
  await writeFile(join(projectRoot, "src/content/manga/series/android-series.md"), "---\nslug: android-series\n---\n");
  await writeFile(join(sourceRoot, "volume-2.cbz"), "two");
  await writeFile(join(sourceRoot, "volume-1.cbz"), "one");

  const optimize = async (options: OptimizeOptions): Promise<OptimizeResult> => {
    await mkdir(options.destination);
    await writeFile(join(options.destination, "001.webp"), "webp");
    return {
      plan: {
        source: options.source,
        destination: options.destination,
        profile: "reader",
        quality: options.quality,
        items: [{
          sourcePath: join(options.source, "0001.source"),
          sourceRelativePath: "0001.source",
          outputRelativePath: "001.webp",
          format: "jpeg",
          action: "convert",
          bytes: 1,
        }],
        ignored: [],
        originalBytes: 1,
      },
      converted: 1,
      copied: 0,
      ignored: 0,
      failed: 0,
      originalBytes: 1,
      optimizedBytes: 1,
      savedBytes: 0,
    };
  };

  try {
    const result = await importMangaVolumes(
      { sources: [sourceRoot], series, quality: 85, projectRoot, mediaRoot },
      {
        listEntries: async (archive) => [
          entry(`Title - c00${archive.endsWith("volume-1.cbz") ? "1" : "2"} (v01) - p001.jpg`),
        ],
        extractEntry: async (_archive, archiveEntry, destination) =>
          writeFile(destination, archiveEntry.path),
        optimize,
        dimensions: async () => ({ width: 1200, height: 1707 }),
      },
    );
    expect(result.chapters.map((chapter) => chapter.number)).toEqual([1, 2]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
