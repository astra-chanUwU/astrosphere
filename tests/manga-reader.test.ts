import { expect, test } from "bun:test";
import { createMangaPageSrc, getMangaInstallmentLabel, sortMangaChapters } from "../src/lib/manga-reader";

const reader = await Bun.file(new URL("../src/components/MangaReader.astro", import.meta.url)).text();
const chapterList = await Bun.file(new URL("../src/components/MangaChapterList.astro", import.meta.url)).text();
const chapterPage = await Bun.file(new URL("../src/pages/manga/[slug]/[chapter].astro", import.meta.url)).text();

test("creates zero-padded manga page URLs", () => {
  expect(createMangaPageSrc("/manga/witches-and-cigarettes/chapter-001", 1)).toBe("/manga/witches-and-cigarettes/chapter-001/001.jpg");
  expect(createMangaPageSrc("/manga/witches-and-cigarettes/chapter-001", 31)).toBe("/manga/witches-and-cigarettes/chapter-001/031.jpg");
});

test("creates WebP manga page URLs when a chapter uses WebP pages", () => {
  expect(createMangaPageSrc("/manga/ghost-in-the-shell/chapter-000", 1, "webp")).toBe("/manga/ghost-in-the-shell/chapter-000/001.webp");
});

test("rejects manga page paths outside the manga media root", () => {
  expect(() => createMangaPageSrc("/media/example/chapter-001", 1)).toThrow("Expected a /manga page path");
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

test("manga navigation uses the series format for installment labels", () => {
  expect(reader).toContain("getMangaInstallmentLabel(series.data.format, chapter.data.number, chapter.data.title)");
  expect(chapterList).toContain("getMangaInstallmentLabel(series.data.format, chapter.data.number, chapter.data.title)");
  expect(chapterList).toContain("series.data.format === \"doujinshi\"");
});

test("manga reader renders previous, series, and next controls at both ends", () => {
  expect(reader).toContain("previousChapter?: ChapterLink");
  expect(reader).toContain("nextChapter?: ChapterLink");
  expect(reader.match(/chapter-navigation/g)?.length).toBeGreaterThanOrEqual(2);
  expect(reader).toContain("data-reader-header");
});

test("manga reader passes root-relative chapter paths to page URL generation", () => {
  expect(reader).toContain("createMangaPageSrc(chapter.data.pagePath, page, chapter.data.pageExtension)");
  expect(reader).not.toContain("PUBLIC_MANGA_ASSET_BASE_URL");
});

test("manga chapter controls retain visible space between links when they wrap", () => {
  expect(reader).toContain("gap: var(--space-3); justify-content: center;");
});

test("manga chapter page supplies adjacent chapter links and opts into the dock", () => {
  expect(chapterPage).toContain("previousChapter={");
  expect(chapterPage).toContain("nextChapter={");
  expect(chapterPage).toContain("readerDock");
});
