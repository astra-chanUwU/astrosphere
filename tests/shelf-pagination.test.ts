import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const pagination = await Bun.file(new URL("src/components/ArchivePagination.astro", root)).text().catch(() => "");
const archive = await Bun.file(new URL("src/components/ShelfArchive.astro", root)).text().catch(() => "");

test("Shelf pagination is accessible, link-based, and shares archive rendering", () => {
  expect(pagination).toContain('aria-label="Pagination"');
  expect(pagination).toContain("aria-current");
  expect(pagination).toContain("aria-label={`Page ${pageNumber}`}");
  expect(pagination).toContain("lastPage >= 1 &&");
  expect(pagination).toContain("Previous");
  expect(pagination).toContain("Next");
  expect(pagination).toContain("Page {currentPage} of {lastPage}");
  expect(pagination).toContain("getArchivePageHref");
  expect(pagination).not.toContain("<script");
  expect(archive).toContain("MangaSeriesCard");
  expect(archive).toContain("ImageSetCard");
  expect(archive).toContain("ArchivePagination");
});
