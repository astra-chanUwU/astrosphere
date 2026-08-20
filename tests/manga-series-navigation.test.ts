import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const seriesRoute = await Bun.file(new URL("src/pages/manga/[slug].astro", root)).text();
const gallery = await Bun.file(new URL("src/components/MangaArtGallery.astro", root)).text();
const seriesMeta = await Bun.file(new URL("src/components/MangaSeriesMeta.astro", root)).text();

test("puts chapters before artwork on manga series pages", () => {
  expect(seriesRoute.indexOf("<MangaChapterList")).toBeLessThan(seriesRoute.indexOf("<MangaArtGallery"));
});

test("offers every artwork image at full size in a new tab", () => {
  expect(gallery).toContain('<a class="full-size-link" href={src} target="_blank" rel="noopener noreferrer">');
  expect(gallery).toContain("Open full size");
});

test("links manga creators to internal creator pages", () => {
  expect(seriesMeta).toContain('href={`/manga/creators/${person.slug}`}');
  expect(seriesMeta).not.toContain("person.url");
});
