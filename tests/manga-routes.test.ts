import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const indexRoute = await Bun.file(new URL("src/pages/manga/index.astro", root)).text().catch(() => "");
const seriesRoute = await Bun.file(new URL("src/pages/manga/[slug].astro", root)).text().catch(() => "");
const readerRoute = await Bun.file(new URL("src/pages/manga/[slug]/[chapter].astro", root)).text().catch(() => "");
const creatorRoute = await Bun.file(new URL("src/pages/manga/creators/[slug].astro", root)).text().catch(() => "");
const navigation = await Bun.file(new URL("../src/config/navigation.ts", import.meta.url)).text();
const oniArtifact = await Bun.file(new URL("../src/content/artifacts/essays/oni-bungie-retrospective.md", import.meta.url)).text().catch(() => "");

test("defines manga detail routes from the canonical Manga archive", () => {
  expect(indexRoute).toContain('<BaseLayout title="Manga"');
  expect(seriesRoute).toContain("getStaticPaths");
  expect(seriesRoute).toContain("MangaArtGallery");
  expect(seriesRoute).toContain('href: "/manga"');
  expect(readerRoute).toContain("getStaticPaths");
  expect(creatorRoute).toContain("getStaticPaths");
  expect(creatorRoute).toContain("getMangaCreators");
  expect(creatorRoute).toContain("MangaSeriesCard");
  expect(creatorRoute).toContain("getPublishedMangaChapters");
  expect(navigation).toContain('{ href: "/manga", label: "Manga" }');
});

test("files the Oni retrospective inside the Games sphere", () => {
  expect(oniArtifact).toContain("spheres: [games]");
  expect(oniArtifact).toContain("/media/games/oni/oni-bungie-cover-art.jpeg");
});
