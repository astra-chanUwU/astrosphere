import { expect, test } from "bun:test";
import { requireMangaMediaRoot, resolveMangaMediaFile } from "../src/lib/manga-media-root";

test("requires an absolute manga media root", () => {
  expect(() => requireMangaMediaRoot("")).toThrow("Set MANGA_MEDIA_ROOT");
  expect(() => requireMangaMediaRoot("relative/manga")).toThrow("must be an absolute path");
  expect(requireMangaMediaRoot("/srv/astrosphere/media/manga/"))
    .toBe("/srv/astrosphere/media/manga");
});

test("maps public manga URLs beneath the external media root", () => {
  expect(resolveMangaMediaFile("/manga/example/chapter-001/001.webp", "/srv/astrosphere/media/manga"))
    .toBe("/srv/astrosphere/media/manga/example/chapter-001/001.webp");
});

test("rejects unrelated and traversing media paths", () => {
  expect(() => resolveMangaMediaFile("/media/example.webp", "/srv/astrosphere/media/manga"))
    .toThrow("Expected a /manga asset path");
  expect(() => resolveMangaMediaFile("/manga/../secret.txt", "/srv/astrosphere/media/manga"))
    .toThrow("escapes MANGA_MEDIA_ROOT");
});
