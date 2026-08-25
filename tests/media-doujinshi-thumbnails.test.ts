import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
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
  collectMediaThumbnailItems,
  collectMangaThumbnailItems,
  generateDoujinshiThumbnails,
  planDoujinshiThumbnails,
  pruneMangaThumbnails,
  pruneMediaThumbnails,
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

test("generates independent thumbnails with a bounded worker pool", async () => {
  const root = await mkdtemp(join(tmpdir(), "doujinshi-thumbnails-workers-"));
  const items = Array.from({ length: 6 }, (_, index) => itemFor(root, index + 1));
  let active = 0;
  let maximumActive = 0;
  try {
    await mkdir(join(root, "manga/example/chapter-001"), { recursive: true });
    for (const item of items) {
      await sharp({ create: { width: 600, height: 900, channels: 3, background: "purple" } }).webp().toFile(item.sourcePath);
    }
    const output = await sharp({ create: { width: 320, height: 480, channels: 3, background: "purple" } }).webp().toBuffer();
    const result = await generateDoujinshiThumbnails(
      { items, dryRun: false, force: false },
      { renderThumbnail: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await Bun.sleep(15);
        active -= 1;
        return output;
      } },
    );
    expect(result.failed).toEqual([]);
    expect(result.generated).toBe(6);
    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(4);
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

test("discovers cover artwork and page thumbnails for manga and doujinshi", () => {
  const root = "/managed";
  const entries = [
    {
      collection: "mangaSeries" as const,
      path: "manga.md",
      body: "",
      data: {
        slug: "regular",
        visibility: "published",
        format: "manga",
        cover: { src: "/manga/regular/cover.webp" },
        art: [{ src: "/media/images/regular/art.webp" }, { src: "https://example.com/remote.jpg" }],
      },
    },
    {
      collection: "mangaSeries" as const,
      path: "doujinshi.md",
      body: "",
      data: {
        slug: "book",
        visibility: "published",
        format: "doujinshi",
        cover: { src: "/manga/book/cover.webp" },
        art: [],
      },
    },
    {
      collection: "mangaChapters" as const,
      path: "regular-chapter.md",
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

  expect(collectMangaThumbnailItems(entries, root).map((item) => item.destinationPublicPath)).toEqual([
    "/manga/book/thumbnails/cover.webp",
    "/manga/regular/chapter-001/thumbnails/001.webp",
    "/manga/regular/thumbnails/art/001.webp",
    "/manga/regular/thumbnails/cover.webp",
  ]);
});

test("discovers managed hero and gallery thumbnails for image sets", () => {
  const root = "/managed";
  const entries = [{
    collection: "imageSets" as const,
    path: "gallery.md",
    body: "",
    data: {
      slug: "gallery",
      status: "published",
      hero: { kind: "image", src: "/media/images/gallery/cover.webp" },
      media: [
        { kind: "image", src: "/media/images/gallery/nested/one.webp" },
        { kind: "image", src: "https://example.com/remote.jpg" },
        { kind: "video", src: "/media/images/gallery/movie.webp" },
      ],
    },
  }];

  expect(collectMediaThumbnailItems(entries, root).map((item) => ({
    source: item.sourcePublicPath,
    destination: item.destinationPublicPath,
  }))).toEqual([
    {
      source: "/media/images/gallery/cover.webp",
      destination: "/media/images/gallery/thumbnails/cover.webp",
    },
    {
      source: "/media/images/gallery/nested/one.webp",
      destination: "/media/images/gallery/thumbnails/nested/one.webp",
    },
  ]);
});

test("prunes only stale files inside reserved thumbnail directories", async () => {
  const root = await mkdtemp(join(tmpdir(), "manga-thumbnail-prune-"));
  const item = itemFor(root, 1);
  const thumbnails = join(root, "manga/example/chapter-001/thumbnails");
  try {
    await mkdir(thumbnails, { recursive: true });
    await writeFile(item.destinationPath, "expected");
    await writeFile(join(thumbnails, "999.webp"), "stale");
    await writeFile(join(root, "manga/example/chapter-001/999.webp"), "original");

    const preview = await pruneMangaThumbnails({ items: [item], root, dryRun: true });
    expect(preview.planned.map((path) => path.endsWith("/999.webp"))).toEqual([true]);
    expect((await readdir(thumbnails)).sort()).toEqual(["001.webp", "999.webp"]);

    const result = await pruneMangaThumbnails({ items: [item], root, dryRun: false });
    expect(result.removed).toHaveLength(1);
    expect(await readdir(thumbnails)).toEqual(["001.webp"]);
    expect(await readFile(join(root, "manga/example/chapter-001/999.webp"), "utf8")).toBe("original");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prunes stale image-set derivatives without touching originals", async () => {
  const root = await mkdtemp(join(tmpdir(), "image-set-thumbnail-prune-"));
  const sourcePath = join(root, "images/gallery/one.webp");
  const destinationPath = join(root, "images/gallery/thumbnails/one.webp");
  const item: DoujinshiThumbnailItem = {
    kind: "image-set",
    series: "gallery",
    chapter: "image-set",
    page: 1,
    sourcePublicPath: "/media/images/gallery/one.webp",
    destinationPublicPath: "/media/images/gallery/thumbnails/one.webp",
    sourcePath,
    destinationPath,
  };
  try {
    await mkdir(join(root, "images/gallery/thumbnails"), { recursive: true });
    await writeFile(sourcePath, "original");
    await writeFile(destinationPath, "expected");
    await writeFile(join(root, "images/gallery/thumbnails/stale.webp"), "stale");

    const result = await pruneMediaThumbnails({ items: [item], root, dryRun: false });

    expect(result.removed).toEqual([join(root, "images/gallery/thumbnails/stale.webp")]);
    expect(await readFile(sourcePath, "utf8")).toBe("original");
    expect(await readdir(join(root, "images/gallery/thumbnails"))).toEqual(["one.webp"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
