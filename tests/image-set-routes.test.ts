import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const indexRoute = await Bun.file(new URL("src/pages/image-sets/index.astro", root)).text().catch(() => "");
const detailRoute = await Bun.file(new URL("src/pages/image-sets/[slug].astro", root)).text().catch(() => "");
const card = await Bun.file(new URL("src/components/ImageSetCard.astro", root)).text().catch(() => "");
const gallery = await Bun.file(new URL("src/components/ImageSetGallery.astro", root)).text().catch(() => "");

test("defines image-set detail routes from the canonical Shelf archive", () => {
  expect(indexRoute).toContain('Astro.redirect("/shelf/image-sets", 301)');
  expect(detailRoute).toContain("getStaticPaths");
  expect(detailRoute).toContain("getPublishedImageSets");
  expect(detailRoute).toContain('href: "/shelf"');
  expect(detailRoute).toContain('href: "/shelf/image-sets"');
  expect(card).toContain("Image set");
  expect(gallery).toContain("MediaGallery");
});
