import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const seriesRoute = await Bun.file(new URL("src/pages/manga/[slug].astro", root)).text();
const preview = await Bun.file(new URL("src/components/DoujinshiPagePreview.astro", root)).text().catch(() => "");

test("adds the doujinshi page preview to the manga overview", () => {
  expect(seriesRoute).toContain("DoujinshiPagePreview");
  expect(seriesRoute).toContain("<DoujinshiPagePreview {series} {chapters} />");
});

test("renders every doujinshi page as a numbered overview thumbnail", () => {
  expect(preview).toContain('class="doujinshi-preview"');
  expect(preview).toContain('aria-label="Doujinshi page preview"');
  expect(preview).toContain("getMangaChapterPages");
  expect(preview).toContain("createMangaPageSrc");
  expect(preview).toContain("Page {page}");
  expect(preview).toContain("loading=\"lazy\"");
});
