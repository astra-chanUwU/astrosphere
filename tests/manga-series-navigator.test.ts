import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const seriesRoute = await Bun.file(new URL("src/pages/manga/[slug].astro", root)).text();
const navigatorFile = Bun.file(new URL("src/components/MangaSeriesNavigator.astro", root));
const navigator = (await navigatorFile.exists()) ? await navigatorFile.text() : "";

test("adds the manga navigator to the series page", () => {
  expect(seriesRoute).toContain("<MangaSeriesNavigator");
});

test("provides fast chapter navigation controls", () => {
  expect(navigator).toContain("Jump to chapter");
  expect(navigator).toContain("First chapter");
  expect(navigator).toContain("Latest chapter");
  expect(navigator).toContain('aria-label="Manga chapter navigator"');
  expect(navigator).toContain("position: sticky");
  expect(navigator).toContain("<select");
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
