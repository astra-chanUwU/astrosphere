import { expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(`../${path}`, import.meta.url)).text();

test("manga media stays root-relative and same-origin", async () => {
  const sources = await Promise.all([
    read("src/components/MangaReader.astro"),
    read("src/components/MangaSeriesCard.astro"),
    read("src/components/MangaArtGallery.astro"),
    read("src/pages/manga/[slug].astro"),
  ]);
  for (const source of sources) {
    expect(source).not.toContain("resolveMangaAssetUrl");
  }
  expect(sources.join("\n")).toContain("series.data.cover.src");
  expect(sources.join("\n")).toContain("piece.src");
});
