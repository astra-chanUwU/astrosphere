import { expect, test } from "bun:test";
import { contentTypeForMangaFile, resolveMangaMediaRequestPath } from "../src/lib/manga-media-server";

test("maps nested manga requests into the configured media root", () => {
  expect(resolveMangaMediaRequestPath("/manga/example/chapter-001/001.webp", "/srv/astrosphere/media/manga"))
    .toBe("/srv/astrosphere/media/manga/example/chapter-001/001.webp");
});

test("ignores requests outside the manga route", () => {
  expect(resolveMangaMediaRequestPath("/favicon.svg", "/srv/astrosphere/media/manga")).toBeUndefined();
});

test("rejects encoded and direct traversal attempts", () => {
  expect(() => resolveMangaMediaRequestPath("/manga/%2e%2e/secret.txt", "/srv/astrosphere/media/manga"))
    .toThrow("escapes MANGA_MEDIA_ROOT");
  expect(() => resolveMangaMediaRequestPath("/manga/../secret.txt", "/srv/astrosphere/media/manga"))
    .toThrow("escapes MANGA_MEDIA_ROOT");
});

test("returns image content types without trusting the browser", () => {
  expect(contentTypeForMangaFile("page.webp")).toBe("image/webp");
  expect(contentTypeForMangaFile("cover.JPG")).toBe("image/jpeg");
  expect(contentTypeForMangaFile("page.png")).toBe("image/png");
  expect(contentTypeForMangaFile("notes.txt")).toBe("application/octet-stream");
});
