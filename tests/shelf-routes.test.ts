import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);

async function readRoute(path: string) {
  const file = Bun.file(new URL(path, root));
  return { path, exists: await file.exists(), source: await file.text().catch(() => "") };
}

const [shelf, ...archiveRoutes] = await Promise.all([
  readRoute("src/pages/shelf/index.astro"),
  readRoute("src/pages/manga/index.astro"),
  readRoute("src/pages/doujinshi/index.astro"),
  readRoute("src/pages/image-sets/index.astro"),
  readRoute("src/pages/manga/page/[page].astro"),
  readRoute("src/pages/doujinshi/page/[page].astro"),
  readRoute("src/pages/image-sets/page/[page].astro"),
]);
const archiveRail = await Bun.file(new URL("src/components/ArchiveRail.astro", root)).text().catch(() => "");

const [manga, doujinshi, imageSets, mangaPages, doujinshiPages, imageSetPages] = archiveRoutes;

test("renders the curated Shelf through its configured selections and category cards", () => {
  expect(shelf.exists).toBe(true);
  expect(shelf.source).toContain("getShelfSelections()");
  expect(shelf.source).toContain("selections.manga.map");
  expect(shelf.source).toContain("selections.doujinshi.map");
  expect(shelf.source).toContain("selections.imageSets.map");
  expect(shelf.source).toContain("<MangaSeriesCard");
  expect(shelf.source).toContain("<ImageSetCard");
  expect(shelf.source).toContain('href="/manga"');
  expect(shelf.source).toContain('href="/doujinshi"');
  expect(shelf.source).toContain('href="/image-sets"');
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

test("gives category archives a consistent two-column rail", () => {
  expect(archiveRail).toContain('class="archive-rail"');
  expect(archiveRail).toContain('href: "/manga"');
  expect(archiveRail).toContain('href: "/doujinshi"');
  expect(archiveRail).toContain('href: "/image-sets"');
  for (const source of archiveRoutes.slice(0, 3).map((route) => route.source)) {
    expect(source).toContain("archive-layout");
    expect(source).toContain("<ArchiveRail");
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
      /paginate\(await getShelfArchive\([^)]+\),\s*\{\s*pageSize:\s*SHELF_PAGE_SIZE\s*\}\)\.filter\(/,
    );
    expect(source).toContain(`category=\"${category}\"`);
    expect(source).toContain("entries={page.data}");
    expect(source).toContain("currentPage={page.currentPage}");
    expect(source).toContain("lastPage={page.lastPage}");
    expect(source).not.toContain("<script");
  }
});
