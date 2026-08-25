import { expect, test } from "bun:test";

const shelfPage = await Bun.file(new URL("../src/pages/shelf/index.astro", import.meta.url)).text();
const mangaPage = await Bun.file(new URL("../src/pages/manga/index.astro", import.meta.url)).text();
const homePage = await Bun.file(new URL("../src/pages/index.astro", import.meta.url)).text();

test("keeps the curated Shelf as an index while category archives use direct routes", () => {
  expect(mangaPage).toContain('<BaseLayout title="Manga"');
  expect(shelfPage).toContain("The Shelf");
  expect(shelfPage).toContain("Manga");
  expect(shelfPage).toContain("Doujinshi");
  expect(shelfPage).toContain("Image sets");
  expect(shelfPage).not.toContain("data-kind-filters");
  expect(homePage).toContain('<a href="/manga">All →</a>');
});
