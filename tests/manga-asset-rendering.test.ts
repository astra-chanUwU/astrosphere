import { expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

test("manga reader sends page images through the configured asset origin", async () => {
  const source = await read("src/components/MangaReader.astro");

  expect(source).toContain("PUBLIC_MANGA_ASSET_BASE_URL");
  expect(source).toContain("createMangaPageSrc(chapter.data.pagePath, page, chapter.data.pageExtension, mangaAssetBaseUrl)");
});

test("manga covers use the configured asset origin everywhere they render", async () => {
  const sources = await Promise.all([
    read("src/components/MangaSeriesCard.astro"),
    read("src/pages/manga/[slug].astro"),
  ]);

  for (const source of sources) {
    expect(source).toContain("resolveMangaAssetUrl");
    expect(source).toContain("PUBLIC_MANGA_ASSET_BASE_URL");
    expect(source).toContain("resolveMangaAssetUrl(series.data.cover.src, mangaAssetBaseUrl)");
  }
});

test("manga artwork uses one resolved URL for images and full-size links", async () => {
  const source = await read("src/components/MangaArtGallery.astro");

  expect(source).toContain("const src = resolveMangaAssetUrl(piece.src, mangaAssetBaseUrl)");
  expect(source).toContain("<img {src}");
  expect(source).toContain("href={src}");
});
