import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);

async function readRoute(path: string) {
  const file = Bun.file(new URL(path, root));
  return { path, exists: await file.exists(), source: await file.text().catch(() => "") };
}

const [shelf, ...archiveRoutes] = await Promise.all([
  readRoute("src/pages/shelf/index.astro"),
  readRoute("src/pages/shelf/manga/index.astro"),
  readRoute("src/pages/shelf/doujinshi/index.astro"),
  readRoute("src/pages/shelf/image-sets/index.astro"),
  readRoute("src/pages/shelf/manga/page/[page].astro"),
  readRoute("src/pages/shelf/doujinshi/page/[page].astro"),
  readRoute("src/pages/shelf/image-sets/page/[page].astro"),
]);

const [manga, doujinshi, imageSets, mangaPages, doujinshiPages, imageSetPages] = archiveRoutes;

test("renders the curated Shelf through its configured selections and category cards", () => {
  expect(shelf.exists).toBe(true);
  expect(shelf.source).toContain("getShelfSelections()");
  expect(shelf.source).toContain("selections.manga.map");
  expect(shelf.source).toContain("selections.doujinshi.map");
  expect(shelf.source).toContain("selections.imageSets.map");
  expect(shelf.source).toContain("<MangaSeriesCard");
  expect(shelf.source).toContain("<ImageSetCard");
  expect(shelf.source).toContain('href="/shelf/manga"');
  expect(shelf.source).toContain('href="/shelf/doujinshi"');
  expect(shelf.source).toContain('href="/shelf/image-sets"');
});

test("builds every category root as its clean first page", () => {
  for (const { path, exists, source, category } of [
    { ...manga, category: "manga" },
    { ...doujinshi, category: "doujinshi" },
    { ...imageSets, category: "image-sets" },
  ]) {
    expect(exists, `${path} exists`).toBe(true);
    expect(source).toContain("SHELF_PAGE_SIZE");
    expect(source).toContain(`getShelfArchive(\"${category}\")`);
    expect(source).toContain("const currentPage = 1");
    expect(source).toContain("Math.ceil(entries.length / SHELF_PAGE_SIZE)");
    expect(source).toContain("entries={entries.slice(0, SHELF_PAGE_SIZE)}");
    expect(source).toContain(`category=\"${category}\"`);
    expect(source).toContain("{currentPage}");
    expect(source).toContain("{lastPage}");
  }
});

test("generates only later static pages with the matching category data", () => {
  for (const { path, exists, source, category } of [
    { ...mangaPages, category: "manga" },
    { ...doujinshiPages, category: "doujinshi" },
    { ...imageSetPages, category: "image-sets" },
  ]) {
    expect(exists, `${path} exists`).toBe(true);
    expect(source).toContain("getStaticPaths");
    expect(source).toContain(`getShelfArchive(\"${category}\")`);
    expect(source).toMatch(
      /return\s+paginate\(\s*entries\s*,\s*\{\s*pageSize:\s*SHELF_PAGE_SIZE\s*\}\s*\)\s*\.filter\(\s*\(\s*path\s*\)\s*=>\s*Number\(\s*path\.params\.page\s*\)\s*>\s*1\s*\)/,
    );
    expect(source).toContain(`category=\"${category}\"`);
    expect(source).toContain("entries={page.data}");
    expect(source).toContain("currentPage={page.currentPage}");
    expect(source).toContain("lastPage={page.lastPage}");
    expect(source).not.toContain("<script");
  }
});
