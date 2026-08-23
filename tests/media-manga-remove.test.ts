import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  executeMangaChapterUnavailable,
  markMangaChapterUnavailable,
  planMangaChapterUnavailable,
} from "../src/lib/media/manga-remove";

const availableChapter = `---
slug: android-series-chapter-005-1
series: android-series
number: 5.1
title: Bonus chapter
pagePath: /manga/android-series/chapter-005-1
pageExtension: webp
pageCount: 2
pageWidth: 1200
pageHeight: 1707
readingDirection: rtl
status: published
---
Keep this note.
`;

test("marks a chapter unavailable without losing its identity or body", () => {
  expect(markMangaChapterUnavailable(availableChapter)).toBe(`---
slug: android-series-chapter-005-1
series: android-series
number: 5.1
title: Bonus chapter
availability: unavailable
status: published
---
Keep this note.
`);
});

test("plans and executes removal only after the caller confirms", async () => {
  const root = await mkdtemp(join(tmpdir(), "manga-remove-"));
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  const contentPath = join(
    projectRoot,
    "src/content/manga/chapters/android-series-chapter-005-1.md",
  );
  const mediaPath = join(
    mediaRoot,
    "manga/android-series/chapter-005-1",
  );
  try {
    await mkdir(join(projectRoot, "src/content/manga/chapters"), {
      recursive: true,
    });
    await mkdir(mediaPath, { recursive: true });
    await writeFile(contentPath, availableChapter);
    await writeFile(join(mediaPath, "001.webp"), "one");
    await writeFile(join(mediaPath, "002.webp"), "two");

    const plan = await planMangaChapterUnavailable({
      projectRoot,
      mediaRoot,
      series: "android-series",
      chapter: 5.1,
    });
    expect(plan).toMatchObject({ contentPath, mediaPath, fileCount: 2, totalBytes: 6 });

    await executeMangaChapterUnavailable(plan);
    expect(await readFile(contentPath, "utf8")).toContain(
      "availability: unavailable",
    );
    expect(await Bun.file(join(mediaPath, "001.webp")).exists()).toBe(false);
    expect(await Bun.file(contentPath).text()).toContain("Keep this note.");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
