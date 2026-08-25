import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  collectDoujinshiThumbnailItems,
  generateDoujinshiThumbnails,
  planDoujinshiThumbnails,
  type DoujinshiThumbnailItem,
} from "../src/lib/media/doujinshi-thumbnails";

const itemFor = (root: string, page: number): DoujinshiThumbnailItem => {
  const name = String(page).padStart(3, "0");
  const chapter = join(root, "manga/example/chapter-001");
  return {
    series: "example",
    chapter: "example-chapter-001",
    page,
    sourcePublicPath: `/manga/example/chapter-001/${name}.webp`,
    destinationPublicPath: `/manga/example/chapter-001/thumbnails/${name}.webp`,
    sourcePath: join(chapter, `${name}.webp`),
    destinationPath: join(chapter, "thumbnails", `${name}.webp`),
  };
};

test("renders verified 320px WebP thumbnails without enlarging narrow pages", async () => {
  const root = await mkdtemp(join(tmpdir(), "doujinshi-thumbnails-"));
  const wide = itemFor(root, 1);
  const narrow = itemFor(root, 2);
  try {
    await mkdir(join(root, "manga/example/chapter-001"), { recursive: true });
    await sharp({
      create: { width: 1200, height: 1800, channels: 3, background: "red" },
    }).webp().toFile(wide.sourcePath);
    await sharp({
      create: { width: 200, height: 300, channels: 3, background: "blue" },
    }).webp().toFile(narrow.sourcePath);

    const result = await generateDoujinshiThumbnails({
      items: [wide, narrow],
      dryRun: false,
      force: false,
    });

    expect(result.generated).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toEqual([]);
    expect(await sharp(wide.destinationPath).metadata()).toMatchObject({
      format: "webp",
      width: 320,
      height: 480,
    });
    expect(await sharp(narrow.destinationPath).metadata()).toMatchObject({
      format: "webp",
      width: 200,
      height: 300,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plans fresh stale invalid and forced thumbnail work", async () => {
  const root = await mkdtemp(join(tmpdir(), "doujinshi-thumbnails-"));
  const item = itemFor(root, 1);
  try {
    await mkdir(join(root, "manga/example/chapter-001"), { recursive: true });
    await sharp({
      create: { width: 600, height: 900, channels: 3, background: "green" },
    }).webp().toFile(item.sourcePath);
    await generateDoujinshiThumbnails({ items: [item], dryRun: false, force: false });

    expect(
      (await planDoujinshiThumbnails({ items: [item], dryRun: false, force: false })).plan[0],
    ).toMatchObject({ action: "skip", reason: "fresh" });

    const future = new Date(Date.now() + 60_000);
    await utimes(item.sourcePath, future, future);
    expect(
      (await planDoujinshiThumbnails({ items: [item], dryRun: false, force: false })).plan[0],
    ).toMatchObject({ action: "generate", reason: "stale" });

    await writeFile(item.destinationPath, "not-webp");
    expect(
      (await planDoujinshiThumbnails({ items: [item], dryRun: false, force: false })).plan[0],
    ).toMatchObject({ action: "generate", reason: "invalid" });

    expect(
      (await planDoujinshiThumbnails({ items: [item], dryRun: false, force: true })).plan[0],
    ).toMatchObject({ action: "generate", reason: "force" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dry-run plans generation without creating a thumbnails directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "doujinshi-thumbnails-"));
  const item = itemFor(root, 1);
  try {
    await mkdir(join(root, "manga/example/chapter-001"), { recursive: true });
    await sharp({
      create: { width: 600, height: 900, channels: 3, background: "white" },
    }).webp().toFile(item.sourcePath);

    const result = await generateDoujinshiThumbnails({
      items: [item],
      dryRun: true,
      force: false,
    });

    expect(result.plan[0]).toMatchObject({ action: "generate", reason: "missing" });
    expect(result.generated).toBe(0);
    expect(result.failed).toEqual([]);
    expect(await readdir(join(root, "manga/example/chapter-001"))).toEqual(["001.webp"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed render leaves no temporary or partial thumbnail", async () => {
  const root = await mkdtemp(join(tmpdir(), "doujinshi-thumbnails-"));
  const item = itemFor(root, 1);
  try {
    await mkdir(join(root, "manga/example/chapter-001"), { recursive: true });
    await sharp({
      create: { width: 600, height: 900, channels: 3, background: "black" },
    }).webp().toFile(item.sourcePath);

    const result = await generateDoujinshiThumbnails(
      { items: [item], dryRun: false, force: false },
      { renderThumbnail: async () => { throw new Error("forced render failure"); } },
    );

    expect(result.generated).toBe(0);
    expect(result.failed[0]?.message).toContain("forced render failure");
    const chapterEntries = await readdir(join(root, "manga/example/chapter-001"));
    expect(chapterEntries).toEqual(["001.webp"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovers only available chapters whose parent series is doujinshi", async () => {
  const root = await mkdtemp(join(tmpdir(), "doujinshi-thumbnails-"));
  try {
    await mkdir(join(root, "manga"), { recursive: true });
    const entries = [
      {
        collection: "mangaSeries" as const,
        path: "doujinshi.md",
        body: "",
        data: { slug: "example", visibility: "published", format: "doujinshi" },
      },
      {
        collection: "mangaSeries" as const,
        path: "manga.md",
        body: "",
        data: { slug: "regular", visibility: "published", format: "manga" },
      },
      {
        collection: "mangaChapters" as const,
        path: "example-chapter-001.md",
        body: "",
        data: {
          slug: "example-chapter-001",
          series: "example",
          status: "published",
          availability: "available",
          pagePath: "/manga/example/chapter-001",
          pageExtension: "webp",
          pageCount: 2,
        },
      },
      {
        collection: "mangaChapters" as const,
        path: "example-chapter-002.md",
        body: "",
        data: {
          slug: "example-chapter-002",
          series: "example",
          status: "published",
          availability: "unavailable",
        },
      },
      {
        collection: "mangaChapters" as const,
        path: "regular-chapter-001.md",
        body: "",
        data: {
          slug: "regular-chapter-001",
          series: "regular",
          status: "published",
          pagePath: "/manga/regular/chapter-001",
          pageExtension: "webp",
          pageCount: 1,
        },
      },
    ];

    const items = collectDoujinshiThumbnailItems(entries, root);
    expect(items.map((item) => item.destinationPublicPath)).toEqual([
      "/manga/example/chapter-001/thumbnails/001.webp",
      "/manga/example/chapter-001/thumbnails/002.webp",
    ]);
    expect(() => collectDoujinshiThumbnailItems(entries, root, "missing")).toThrow(
      "Doujinshi series not found",
    );
    expect(() => collectDoujinshiThumbnailItems(entries, root, "regular")).toThrow(
      "not a doujinshi",
    );
    expect((await stat(root)).isDirectory()).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
