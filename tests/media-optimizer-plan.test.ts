import { expect, test } from "bun:test";
import {
  createReaderOutputName,
  isIgnoredMediaJunk,
  naturalSortMediaPaths,
  planMediaOptimization,
} from "../src/lib/media/optimizer";

const options = {
  source: "/source",
  destination: "/output",
  profile: "reader" as const,
  quality: 85,
  dryRun: true,
};

type Source = {
  path: string;
  format: "jpeg" | "png" | "gif" | "webp" | "avif" | "unknown";
  bytes: number;
};

const planner = (sources: Source[]) => ({
  inspectSource: async () => sources,
  pathExists: async () => false,
});

const expectRejection = async (
  operation: Promise<unknown>,
  message: string,
): Promise<void> => {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error("Expected media optimization planning to reject.");
};

test("naturally orders one reader directory and emits padded WebP names", async () => {
  const plan = await planMediaOptimization(options, planner([
    { path: "10.png", format: "png", bytes: 10 },
    { path: "2.jpg", format: "jpeg", bytes: 20 },
    { path: ".DS_Store", format: "unknown", bytes: 1 },
  ]));

  expect(createReaderOutputName(1)).toBe("001.webp");
  expect(plan.items.map((item) => item.outputRelativePath)).toEqual([
    "001.webp",
    "002.webp",
  ]);
  expect(plan.items.map((item) => item.sourcePath)).toEqual([
    "/source/2.jpg",
    "/source/10.png",
  ]);
  expect(plan.ignored).toEqual([".DS_Store"]);
  expect(plan.originalBytes).toBe(30);
});

test("strips one common wrapper before finding the reader directory", async () => {
  const plan = await planMediaOptimization(options, planner([
    { path: "release/pages/10.png", format: "png", bytes: 10 },
    { path: "release/pages/2.jpg", format: "jpeg", bytes: 20 },
  ]));

  expect(plan.items.map((item) => item.sourceRelativePath)).toEqual([
    "pages/2.jpg",
    "pages/10.png",
  ]);
  expect(plan.items.map((item) => item.outputRelativePath)).toEqual([
    "001.webp",
    "002.webp",
  ]);
});

test("rejects ambiguous reader trees", async () => {
  await expectRejection(planMediaOptimization(options, planner([
    { path: "chapter-001/001.jpg", format: "jpeg", bytes: 10 },
    { path: "chapter-002/001.jpg", format: "jpeg", bytes: 10 },
  ])), "multiple reader directories");
});

test("preserves gallery directories and basenames for every accepted file", async () => {
  const plan = await planMediaOptimization({ ...options, profile: "gallery" }, planner([
    { path: "set-b/cover.jpg", format: "jpeg", bytes: 10 },
    { path: "set-a/cover.jpg", format: "jpeg", bytes: 20 },
    { path: "set-a/animated.gif", format: "gif", bytes: 30 },
    { path: "set-a/already.webp", format: "webp", bytes: 40 },
  ]));

  expect(plan.items).toEqual([
    {
      sourcePath: "/source/set-a/already.webp",
      sourceRelativePath: "set-a/already.webp",
      outputRelativePath: "set-a/already.webp",
      format: "webp",
      action: "copy",
      bytes: 40,
    },
    {
      sourcePath: "/source/set-a/animated.gif",
      sourceRelativePath: "set-a/animated.gif",
      outputRelativePath: "set-a/animated.webp",
      format: "gif",
      action: "convert",
      bytes: 30,
    },
    {
      sourcePath: "/source/set-a/cover.jpg",
      sourceRelativePath: "set-a/cover.jpg",
      outputRelativePath: "set-a/cover.webp",
      format: "jpeg",
      action: "convert",
      bytes: 20,
    },
    {
      sourcePath: "/source/set-b/cover.jpg",
      sourceRelativePath: "set-b/cover.jpg",
      outputRelativePath: "set-b/cover.webp",
      format: "jpeg",
      action: "convert",
      bytes: 10,
    },
  ]);
});

test("rejects portable gallery output collisions", async () => {
  await expectRejection(planMediaOptimization({ ...options, profile: "gallery" }, planner([
    { path: "art/Cover.JPG", format: "jpeg", bytes: 10 },
    { path: "art/cover.png", format: "png", bytes: 20 },
  ])), "art/cover.png");
});

test("separates same-basename gallery files in different directories", async () => {
  const plan = await planMediaOptimization({ ...options, profile: "gallery" }, planner([
    { path: "set-b/cover.jpg", format: "jpeg", bytes: 10 },
    { path: "set-a/cover.jpg", format: "jpeg", bytes: 20 },
  ]));

  expect(plan.items.map((item) => item.outputRelativePath)).toEqual([
    "set-a/cover.webp",
    "set-b/cover.webp",
  ]);
});

test("ignores only known platform junk", () => {
  expect(isIgnoredMediaJunk(".DS_Store")).toBe(true);
  expect(isIgnoredMediaJunk("album/Thumbs.db")).toBe(true);
  expect(isIgnoredMediaJunk("__MACOSX/._cover.jpg")).toBe(true);
  expect(isIgnoredMediaJunk("album/cover.jpg")).toBe(false);
  expect(isIgnoredMediaJunk("notes.txt")).toBe(false);
});

test("rejects AVIF with its exact source path", async () => {
  await expectRejection(planMediaOptimization(options, planner([
    { path: "chapter/motion.avif", format: "avif", bytes: 10 },
  ])), "chapter/motion.avif");
});

test("rejects unknown inputs rather than silently omitting them", async () => {
  await expectRejection(planMediaOptimization(options, planner([
    { path: "chapter/notes.txt", format: "unknown", bytes: 10 },
  ])), "chapter/notes.txt");
});

test("refuses existing destinations through the injected adapter", async () => {
  let inspected = false;

  await expectRejection(planMediaOptimization(options, {
    inspectSource: async () => {
      inspected = true;
      return [];
    },
    pathExists: async () => true,
  }), "/output");

  expect(inspected).toBe(false);
});

test("rejects a source with no accepted media", async () => {
  await expectRejection(planMediaOptimization(options, planner([
    { path: "__MACOSX/._page.jpg", format: "unknown", bytes: 1 },
    { path: ".DS_Store", format: "unknown", bytes: 1 },
  ])), "no accepted media files");
});

test("plans one supported source file from its absolute source path", async () => {
  const plan = await planMediaOptimization({
    ...options,
    source: "/source/single-page.jpeg",
  }, planner([
    { path: "/source/single-page.jpeg", format: "jpeg", bytes: 10 },
  ]));

  expect(plan.items).toEqual([
    {
      sourcePath: "/source/single-page.jpeg",
      sourceRelativePath: "single-page.jpeg",
      outputRelativePath: "001.webp",
      format: "jpeg",
      action: "convert",
      bytes: 10,
    },
  ]);
});

test("naturally sorts media paths with a stable page-name order", () => {
  expect(naturalSortMediaPaths(["010.png", "2.jpg", "001.webp", "cover.jpg"])).toEqual([
    "001.webp",
    "2.jpg",
    "010.png",
    "cover.jpg",
  ]);
  expect(createReaderOutputName(47)).toBe("047.webp");
});
