import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const indexRoute = await Bun.file(new URL("src/pages/image-sets/index.astro", root)).text().catch(() => "");
const detailRoute = await Bun.file(new URL("src/pages/image-sets/[slug].astro", root)).text().catch(() => "");
const card = await Bun.file(new URL("src/components/ImageSetCard.astro", root)).text().catch(() => "");
const gallery = await Bun.file(new URL("src/components/ImageSetGallery.astro", root)).text().catch(() => "");
const meta = await Bun.file(new URL("src/components/ImageSetMeta.astro", root)).text().catch(() => "");

test("defines image-set detail routes from the canonical Image sets archive", () => {
  expect(indexRoute).toContain('<BaseLayout title="Image sets"');
  expect(detailRoute).toContain("getStaticPaths");
  expect(detailRoute).toContain("getPublishedImageSets");
  expect(detailRoute).toContain('href: "/image-sets"');
  expect(card).toContain("Image set");
  expect(gallery).toContain("MediaGallery");
});

test("renders image-set artists and tags as archive links", () => {
  expect(detailRoute).toContain("ImageSetMeta");
  expect(meta).toContain('href={`/tags/${artist.slug}`}');
  expect(meta).toContain('href={`/tags/${tag}`}');
  expect(meta).toContain('href={`/spheres/${sphere}`}');
});
