import { expect, test } from "bun:test";
import {
  collectDenseGalleryImageSources,
  createManagedImageThumbnailSrc,
  managedImageThumbnailRemarkPlugin,
} from "../src/lib/managed-image-thumbnails";

test("maps managed article and topic images into owner-scoped WebP thumbnails", () => {
  expect(
    createManagedImageThumbnailSrc("/media/images/article-owner/gallery/frame.jpg"),
  ).toBe("/media/images/article-owner/thumbnails/gallery/frame.webp");
  expect(
    createManagedImageThumbnailSrc("/media/images/topic-covers/anime.webp"),
  ).toBe("/media/images/topic-covers/thumbnails/anime.webp");
  expect(
    createManagedImageThumbnailSrc("/media/images/article-owner/thumbnails/frame.webp"),
  ).toBe("/media/images/article-owner/thumbnails/frame.webp");
  expect(createManagedImageThumbnailSrc("https://example.com/frame.jpg")).toBe(
    "https://example.com/frame.jpg",
  );
});

test("collects only managed images inside opted-in gallery and grid containers", () => {
  const body = `
![Editorial image](/media/images/article/editorial.webp)
<img src="/media/images/article/standalone.webp" alt="Standalone">
<div class="character-grid">
<article><img src="/media/images/article/portrait.webp" alt="Portrait"></article>
</div>
<div class="route-gallery compact">
<figure><img src='/media/images/article/route.png' alt='Route'></figure>
<img src="https://example.com/remote.jpg" alt="Remote">
</div>`;

  expect(collectDenseGalleryImageSources(body)).toEqual([
    "/media/images/article/portrait.webp",
    "/media/images/article/route.png",
  ]);
});

test("remark thumbnails gallery images while preserving existing links and full-size access", () => {
  const tree = {
    type: "root",
    children: [
      { type: "html", value: '<div class="character-grid">' },
      {
        type: "html",
        value:
          '<article><a href="/articles/person"><img src="/media/images/people/person.png" alt="Person"></a></article>',
      },
      {
        type: "html",
        value:
          '<figure><img src="/media/images/people/detail.webp" alt="Detail"><figcaption>Detail</figcaption></figure>',
      },
      { type: "html", value: "</div>" },
      {
        type: "html",
        value: '<img src="/media/images/people/editorial.webp" alt="Editorial">',
      },
    ],
  };

  const transform = managedImageThumbnailRemarkPlugin();
  transform(tree);

  expect(tree.children[1]?.value).toContain('href="/articles/person"');
  expect(tree.children[1]?.value).toContain(
    'src="/media/images/people/thumbnails/person.webp"',
  );
  expect(tree.children[2]?.value).toContain(
    'href="/media/images/people/detail.webp"',
  );
  expect(tree.children[2]?.value).toContain(
    'src="/media/images/people/thumbnails/detail.webp"',
  );
  expect(tree.children[4]?.value).toContain(
    'src="/media/images/people/editorial.webp"',
  );
});
