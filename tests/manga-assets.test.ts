import { expect, test } from "bun:test";
import { resolveMangaAssetUrl } from "../src/lib/manga-assets";

test("keeps same-origin manga URLs by default", () => {
  expect(resolveMangaAssetUrl("/manga/example/chapter-001/001.webp")).toBe("/manga/example/chapter-001/001.webp");
});

test("moves manga assets to a configured development origin", () => {
  expect(resolveMangaAssetUrl("/manga/example/cover.webp", "http://localhost:4322/manga/"))
    .toBe("http://localhost:4322/manga/example/cover.webp");
});

test("preserves explicit HTTPS manga assets", () => {
  expect(resolveMangaAssetUrl("https://media.example.test/manga/example/cover.webp", "/manga"))
    .toBe("https://media.example.test/manga/example/cover.webp");
});

test("rejects unrelated root-relative paths", () => {
  expect(() => resolveMangaAssetUrl("/media/example.webp", "/manga")).toThrow("Expected a /manga asset path");
});
