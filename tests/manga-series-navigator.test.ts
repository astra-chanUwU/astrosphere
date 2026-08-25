import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const seriesRoute = await Bun.file(new URL("src/pages/manga/[slug].astro", root)).text();
const navigatorFile = Bun.file(new URL("src/components/MangaSeriesNavigator.astro", root));
const navigator = (await navigatorFile.exists()) ? await navigatorFile.text() : "";

test("adds the manga navigator to the series page", () => {
  expect(seriesRoute).toContain("<MangaSeriesNavigator");
});

test("enables the shared reading dock on the manga series page", () => {
  expect(seriesRoute).toContain("sidebar={sidebar} readerDock");
});

test("uses the manga sidebar for discovery instead of a full chapter list", () => {
  expect(seriesRoute).toContain('label: "Similar manga"');
  expect(seriesRoute).toContain('label: "Tags"');
  expect(seriesRoute).toContain('label: "Creators"');
  expect(seriesRoute).toContain("getPublishedMangaSeries");
  expect(seriesRoute).toContain("/manga/creators/");
  expect(seriesRoute).toContain("/tags/");
  expect(seriesRoute).not.toContain('label: "Chapters"');
});

test("provides fast chapter navigation controls", () => {
  expect(navigator).toContain("Jump to chapter");
  expect(navigator).toContain("First chapter");
  expect(navigator).toContain("Latest chapter");
  expect(navigator).toContain('aria-label="Manga chapter navigator"');
  expect(navigator).toContain("position: sticky");
  expect(navigator).toContain("<select");
  expect(navigator).toContain('class="chapter-index"');
  expect(navigator).toContain("Browse all chapters");
  expect(navigator).toContain("<details");
});

test("puts a numbered chapter grid before the artwork preview", () => {
  expect(navigator).toContain("chapter-grid");
  expect(navigator.indexOf("chapter-grid")).toBeLessThan(navigator.indexOf("art-preview"));
});

test("receives the series artwork for the compact preview", () => {
  expect(seriesRoute).toContain("<MangaSeriesNavigator {series} {chapters} art={series.data.art} />");
  expect(seriesRoute).toContain("art={series.data.art}");
  expect(navigator).toContain("art.map");
  expect(navigator).not.toContain("art.slice");
  expect(navigator).toContain("Open full artwork gallery");
});

test("uses generated thumbnails for the compact doujinshi page sampler", () => {
  expect(navigator).toContain('class="page-sampler"');
  expect(navigator).toContain('series.data.format === "doujinshi"');
  expect(navigator).toContain("createDoujinshiThumbnailSrc");
  expect(navigator).not.toContain("createMangaPageSrc");
  expect(navigator).toContain("View all page previews");
});
