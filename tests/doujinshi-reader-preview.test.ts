import { expect, test } from "bun:test";

const reader = await Bun.file(new URL("../src/components/MangaReader.astro", import.meta.url)).text();

test("adds a page preview rail for doujinshi readers", () => {
  expect(reader).toContain('series.data.format === "doujinshi"');
  expect(reader).toContain('class="page-preview"');
  expect(reader).toContain('aria-label="Page previews"');
  expect(reader).toContain('href={`#page-${page}`}');
  expect(reader).toContain("createDoujinshiThumbnailSrc(chapter.data.pagePath!, page)");
  expect(reader).toContain('id={`page-${page}`}');
  expect(reader).toContain("object-fit: contain");
});

test("moves the doujinshi preview rail above the full page stack on small screens", () => {
  expect(reader).toContain(".reader-pages");
  expect(reader).toContain(".reader-pages { display: block; }");
  expect(reader).toContain("overflow-x: auto");
});
