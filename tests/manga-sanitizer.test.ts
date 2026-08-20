import { expect, test } from "bun:test";
import { createSanitizedPageName, isSupportedMangaImage, sortMangaSourceFiles } from "../src/lib/manga-sanitizer";

test("orders numbered manga pages naturally", () => {
  expect(sortMangaSourceFiles(["010.png", "2.jpg", "001.webp", "cover.jpg"])).toEqual([
    "001.webp",
    "2.jpg",
    "010.png",
    "cover.jpg",
  ]);
});

test("accepts image pages and rejects unrelated files", () => {
  expect(isSupportedMangaImage("page-001.jpeg")).toBe(true);
  expect(isSupportedMangaImage(".DS_Store")).toBe(false);
  expect(isSupportedMangaImage("notes.txt")).toBe(false);
});

test("creates zero-padded WebP page names", () => {
  expect(createSanitizedPageName(1)).toBe("001.webp");
  expect(createSanitizedPageName(47)).toBe("047.webp");
});
