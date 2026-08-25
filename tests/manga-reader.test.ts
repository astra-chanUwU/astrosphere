import { expect, test } from "bun:test";
import {
  createDoujinshiThumbnailSrc,
  createMangaArtworkThumbnailSrc,
  createMangaArtworkPreviewSrc,
  createMangaCoverThumbnailSrc,
  createMangaCoverPreviewSrc,
  createMangaPageSrc,
  getMangaChapterAvailabilityLabel,
  getMangaChapterPages,
  getMangaInstallmentLabel,
  sortMangaChapters,
} from "../src/lib/manga-reader";

const reader = await Bun.file(new URL("../src/components/MangaReader.astro", import.meta.url)).text();
const chapterList = await Bun.file(new URL("../src/components/MangaChapterList.astro", import.meta.url)).text();
const navigator = await Bun.file(new URL("../src/components/MangaSeriesNavigator.astro", import.meta.url)).text();
const seriesPage = await Bun.file(new URL("../src/pages/manga/[slug].astro", import.meta.url)).text();
const chapterPage = await Bun.file(new URL("../src/pages/manga/[slug]/[chapter].astro", import.meta.url)).text();
const seriesCard = await Bun.file(new URL("../src/components/MangaSeriesCard.astro", import.meta.url)).text();

test("creates zero-padded manga page URLs", () => {
  expect(createMangaPageSrc("/manga/witches-and-cigarettes/chapter-001", 1)).toBe("/manga/witches-and-cigarettes/chapter-001/001.jpg");
  expect(createMangaPageSrc("/manga/witches-and-cigarettes/chapter-001", 31)).toBe("/manga/witches-and-cigarettes/chapter-001/031.jpg");
});

test("creates WebP manga page URLs when a chapter uses WebP pages", () => {
  expect(createMangaPageSrc("/manga/ghost-in-the-shell/chapter-000", 1, "webp")).toBe("/manga/ghost-in-the-shell/chapter-000/001.webp");
});

test("creates zero-padded doujinshi thumbnail URLs", () => {
  expect(createDoujinshiThumbnailSrc("/manga/witches-and-cigarettes/chapter-001", 1)).toBe(
    "/manga/witches-and-cigarettes/chapter-001/thumbnails/001.webp",
  );
  expect(createDoujinshiThumbnailSrc("/manga/witches-and-cigarettes/chapter-001/", 31)).toBe(
    "/manga/witches-and-cigarettes/chapter-001/thumbnails/031.webp",
  );
});

test("creates compact series cover and artwork thumbnail URLs", () => {
  expect(createMangaCoverThumbnailSrc("lycoris-recoil")).toBe(
    "/manga/lycoris-recoil/thumbnails/cover.webp",
  );
  expect(createMangaCoverThumbnailSrc("sorry-but-im-not-into-yuri", "/manga/sorry-but-Im-not-into-yuri/cover.webp")).toBe(
    "/manga/sorry-but-Im-not-into-yuri/thumbnails/cover.webp",
  );
  expect(createMangaArtworkThumbnailSrc("lycoris-recoil", 2)).toBe(
    "/manga/lycoris-recoil/thumbnails/art/002.webp",
  );
  expect(createMangaArtworkPreviewSrc("manga", "lycoris-recoil", 2, "/media/images/lycoris/art.webp", "/manga/lycoris-recoil/cover.webp")).toBe(
    "/manga/lycoris-recoil/thumbnails/art/002.webp",
  );
  expect(createMangaArtworkPreviewSrc("manga", "lycoris-recoil", 2, "https://example.com/art.jpg")).toBe(
    "https://example.com/art.jpg",
  );
  expect(createMangaCoverPreviewSrc("manga", "lycoris-recoil", "/manga/lycoris-recoil/cover.webp")).toBe(
    "/manga/lycoris-recoil/thumbnails/cover.webp",
  );
  expect(createMangaCoverPreviewSrc("one-shot", "short", "/manga/short/cover.webp")).toBe(
    "/manga/short/cover.webp",
  );
});

test("rejects unsafe doujinshi thumbnail paths and page numbers", () => {
  expect(() => createDoujinshiThumbnailSrc("/manga/../media/chapter-001", 1)).toThrow(
    "Expected a /manga page path",
  );
  expect(() => createDoujinshiThumbnailSrc("/manga/book/chapter-001", 0)).toThrow(
    "positive page number",
  );
});

test("rejects manga page paths outside the manga media root", () => {
  expect(() => createMangaPageSrc("/media/example/chapter-001", 1)).toThrow("Expected a /manga page path");
});

test("rejects manga page paths that escape the manga media root through dot segments", () => {
  expect(() => createMangaPageSrc("/manga/../media/chapter-001", 1)).toThrow("Expected a /manga page path");
});

test("rejects relative manga page paths", () => {
  expect(() => createMangaPageSrc("manga/chapter-001", 1)).toThrow("Expected a /manga page path");
});

test("sorts manga chapters numerically", () => {
  expect(sortMangaChapters([{ data: { number: 10 } }, { data: { number: 1 } }]).map((chapter) => chapter.data.number)).toEqual([1, 10]);
});

test("labels regular manga installments as numbered chapters", () => {
  expect(getMangaInstallmentLabel("manga", 1)).toBe("Chapter 1");
});

test("labels doujinshi installments without a chapter number", () => {
  expect(getMangaInstallmentLabel("doujinshi", 1)).toBe("Doujinshi");
});

test("labels one-shot installments without a chapter number", () => {
  expect(getMangaInstallmentLabel("one-shot", 1)).toBe("One-shot");
});

test("unavailable chapters expose a clear label and no reader pages", () => {
  expect(
    getMangaChapterAvailabilityLabel({ availability: "unavailable" }),
  ).toBe("Currently unavailable");
  expect(getMangaChapterPages({ availability: "unavailable" })).toEqual([]);
});

test("available chapters expose their page count and reader pages", () => {
  expect(getMangaChapterAvailabilityLabel({ pageCount: 3 })).toBe("3 pages");
  expect(getMangaChapterPages({ pageCount: 3 })).toEqual([1, 2, 3]);
});

test("manga navigation uses the series format for installment labels", () => {
  expect(reader).toContain("getMangaInstallmentLabel(series.data.format, chapter.data.number, chapter.data.title)");
  expect(chapterList).toContain("getMangaInstallmentLabel(series.data.format, chapter.data.number, series.data.format === \"doujinshi\" ? undefined : chapter.data.title)");
  expect(chapterList).toContain("series.data.format === \"doujinshi\"");
});

test("manga detail previews stay inside compact media bounds", () => {
  expect(navigator).toContain("max-width: 5rem");
  expect(navigator).toContain("max-height: 8rem");
  expect(navigator).toContain("overflow: hidden");
  expect(seriesPage).toContain("max-width: 8rem");
});

test("manga reader renders previous, series, and next controls at both ends", () => {
  expect(reader).toContain("previousChapter?: ChapterLink");
  expect(reader).toContain("nextChapter?: ChapterLink");
  expect(reader.match(/chapter-navigation/g)?.length).toBeGreaterThanOrEqual(2);
  expect(reader).toContain("data-reader-header");
});

test("manga reader passes root-relative chapter paths to page URL generation", () => {
  expect(reader).toContain("createMangaPageSrc(chapter.data.pagePath!, page, chapter.data.pageExtension)");
});

test("compact manga cards and series headers use cover thumbnails", () => {
  expect(seriesCard).toContain("createMangaCoverPreviewSrc(series.data.format, series.data.slug, series.data.cover.src)");
  expect(seriesPage).toContain("createMangaCoverPreviewSrc(series.data.format, series.data.slug, series.data.cover.src)");
  expect(seriesCard).not.toContain("src={series.data.cover.src}");
});

test("regular manga readers use page thumbnails without squeezing unpreviewed formats", () => {
  expect(reader).toContain('series.data.format === "manga" || series.data.format === "doujinshi"');
  expect(reader).toContain('class:list={["reader-pages", { "has-page-preview": showPagePreview }]}');
  expect(reader).toContain('.reader-pages.has-page-preview');
});

test("manga reader and chapter list show unavailable chapters without page images", () => {
  expect(reader).toContain("This chapter’s media is currently unavailable.");
  expect(chapterList).toContain("getMangaChapterAvailabilityLabel(chapter.data)");
});

test("manga chapter controls retain visible space between links when they wrap", () => {
  expect(reader).toContain("gap: var(--space-3); justify-content: center;");
});

test("manga chapter page supplies adjacent chapter links and opts into the dock", () => {
  expect(chapterPage).toContain("previousChapter={");
  expect(chapterPage).toContain("nextChapter={");
  expect(chapterPage).toContain("readerDock");
});
