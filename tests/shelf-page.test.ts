import { expect, test } from "bun:test";

const shelfPage = await Bun.file(new URL("../src/pages/shelf/index.astro", import.meta.url)).text();
const legacyMangaIndex = await Bun.file(new URL("../src/pages/manga/index.astro", import.meta.url)).text();
const homePage = await Bun.file(new URL("../src/pages/index.astro", import.meta.url)).text();

test("moves the Shelf index to its canonical URL", () => {
  expect(legacyMangaIndex).toContain('Astro.redirect("/shelf", 301)');
  expect(shelfPage).toContain("The Shelf");
  expect(shelfPage).toContain("Manga");
  expect(shelfPage).toContain("Doujinshi");
  expect(shelfPage).toContain("Image sets");
  expect(shelfPage).not.toContain("data-kind-filters");
  expect(homePage).toContain('<a href="/shelf/manga">All manga</a>');
});
