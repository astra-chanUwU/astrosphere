import { expect, test } from "bun:test";

const routes = await import("../src/lib/manga-reader") as Record<string, unknown>;

test("assigns doujinshi and manga formats to separate public routes", () => {
  const getMangaPublicPath = routes.getMangaPublicPath as
    | ((format: string, slug: string, chapter?: string) => string)
    | undefined;

  expect(typeof getMangaPublicPath).toBe("function");
  expect(getMangaPublicPath?.("doujinshi", "book")).toBe("/doujinshi/book");
  expect(getMangaPublicPath?.("doujinshi", "book", "chapter-001")).toBe("/doujinshi/book/chapter-001");
  expect(getMangaPublicPath?.("manga", "series")).toBe("/manga/series");
  expect(getMangaPublicPath?.("one-shot", "story")).toBe("/manga/story");
});

test("matches content formats only to their public route namespace", () => {
  const belongsToMangaPublicRoute = routes.belongsToMangaPublicRoute as
    | ((format: string, route: "manga" | "doujinshi") => boolean)
    | undefined;

  expect(typeof belongsToMangaPublicRoute).toBe("function");
  expect(belongsToMangaPublicRoute?.("doujinshi", "doujinshi")).toBe(true);
  expect(belongsToMangaPublicRoute?.("doujinshi", "manga")).toBe(false);
  expect(belongsToMangaPublicRoute?.("manga", "manga")).toBe(true);
  expect(belongsToMangaPublicRoute?.("one-shot", "doujinshi")).toBe(false);
});
