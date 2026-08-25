import { expect, test } from "bun:test";
import {
  IMAGE_SET_GALLERY_PAGE_SIZE,
  createImageSetThumbnailSrc,
  getImageSetGalleryPage,
  getImageSetGalleryPageHref,
} from "../src/lib/image-set-gallery";

const root = new URL("../", import.meta.url);
const detailRoute = await Bun.file(new URL("src/pages/image-sets/[slug].astro", root)).text();
const paginatedRoute = await Bun.file(new URL("src/pages/image-sets/[slug]/page/[page].astro", root)).text().catch(() => "");
const gallery = await Bun.file(new URL("src/components/ImageSetGallery.astro", root)).text();

test("splits image-set galleries into stable 24-image pages", () => {
  const images = Array.from({ length: 50 }, (_, index) => `image-${index + 1}`);

  expect(IMAGE_SET_GALLERY_PAGE_SIZE).toBe(24);
  expect(getImageSetGalleryPage(images, 1)).toEqual({ items: images.slice(0, 24), start: 1, end: 24, lastPage: 3 });
  expect(getImageSetGalleryPage(images, 3)).toEqual({ items: images.slice(48), start: 49, end: 50, lastPage: 3 });
  expect(getImageSetGalleryPageHref("flou-collection-2018-2021", 1)).toBe("/image-sets/flou-collection-2018-2021");
  expect(getImageSetGalleryPageHref("flou-collection-2018-2021", 2)).toBe("/image-sets/flou-collection-2018-2021/page/2");
});

test("derives managed image-set previews while preserving unsupported sources", () => {
  expect(createImageSetThumbnailSrc(
    "gallery",
    "/media/images/gallery/one.jpg",
  )).toBe("/media/images/gallery/thumbnails/one.webp");
  expect(createImageSetThumbnailSrc(
    "gallery",
    "/media/images/gallery/nested/two.png",
  )).toBe("/media/images/gallery/thumbnails/nested/two.webp");
  expect(createImageSetThumbnailSrc(
    "gallery",
    "/media/images/gallery/thumbnails/one.webp",
  )).toBe("/media/images/gallery/thumbnails/one.webp");
  expect(createImageSetThumbnailSrc("gallery", "https://example.com/remote.jpg"))
    .toBe("https://example.com/remote.jpg");
});

test("renders the first gallery page canonically and generates later pages statically", () => {
  expect(detailRoute).toContain("const currentPage = 1");
  expect(detailRoute).toContain("<ImageSetGallery {imageSet} {currentPage} />");
  expect(gallery).toContain("ArchivePagination");
  expect(gallery).toContain("const summary = `Images ${start}");
  expect(gallery).not.toContain("<script");
  expect(paginatedRoute).toContain("getStaticPaths");
  expect(paginatedRoute).toContain("getImageSetGalleryPage");
  expect(paginatedRoute).toContain("currentPage > 1");
});
