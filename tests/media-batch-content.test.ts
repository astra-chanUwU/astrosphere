import { expect, test } from "bun:test";
import { parseContentDocument } from "../src/lib/media/content-source";
import { parseBatchManifest } from "../src/lib/media/batch-manifest";
import {
  renderDoujinshiChapter,
  renderDoujinshiSeries,
  renderImageSet,
} from "../src/lib/media/batch-content";

const manifest = parseBatchManifest(`
version: 1
defaults: { ignoreEntries: [] }
entries:
  - type: doujinshi
    archive: Example.zip
    mode: create
    series:
      slug: example
      title: Example
      originalTitle: Example Original
      aliases: [Example Alias]
      status: completed
      publicationYear: 2026
      description: Example description.
      rating: explicit
      origin: original
      tags: [english]
      authors: [{ name: Example Circle, slug: example-circle }]
      artists: [{ name: Example Artist, slug: example-artist }]
      featured: false
    chapters:
      - number: 1
        title: Doujinshi
        pages: all
        body: The complete example.
  - type: image-set
    archive: Gallery.zip
    mode: create
    imageSet:
      slug: gallery
      title: Gallery
      summary: Gallery summary.
      publishedAt: 2025-11-15
      rating: explicit
      tags: [imageset]
      spheres: [anime]
      featured: false
      author: maiqo
`, "batch.yaml");

test("renders a published doujinshi series with root-relative cover metadata", () => {
  const entry = manifest.entries[0]!;
  if (entry.type !== "doujinshi" || entry.mode !== "create") throw new Error("fixture");
  const document = parseContentDocument(
    renderDoujinshiSeries(entry, {
      src: "/manga/example/cover.webp",
      width: 1200,
      height: 1700,
    }, "published"),
    "example.md",
    "mangaSeries",
  );
  expect(document.data).toMatchObject({
    slug: "example",
    visibility: "published",
    format: "doujinshi",
    cover: {
      kind: "image",
      src: "/manga/example/cover.webp",
      width: 1200,
      height: 1700,
    },
  });
});

test("renders verified chapter reader metadata and its configured body", () => {
  const entry = manifest.entries[0]!;
  if (entry.type !== "doujinshi") throw new Error("fixture");
  const document = parseContentDocument(
    renderDoujinshiChapter(
      "example",
      entry.chapters[0]!,
      { pageCount: 2, width: 1200, height: 1700 },
      "draft",
    ),
    "chapter.md",
    "mangaChapters",
  );
  expect(document.data).toMatchObject({
    slug: "example-chapter-001",
    title: "Doujinshi",
    pagePath: "/manga/example/chapter-001",
    pageExtension: "webp",
    pageCount: 2,
    status: "draft",
  });
  expect(document.body.trim()).toBe("The complete example.");
});

test("renders every image-set source exactly once with the first as hero", () => {
  const entry = manifest.entries[1]!;
  if (entry.type !== "image-set") throw new Error("fixture");
  const document = parseContentDocument(
    renderImageSet(entry, [
      { src: "/media/images/gallery/001.webp", width: 900, height: 1200 },
      { src: "/media/images/gallery/002.webp", width: 1000, height: 1000 },
    ], "published"),
    "gallery.md",
    "imageSets",
  );
  expect(document.data.hero).toMatchObject({
    src: "/media/images/gallery/001.webp",
    width: 900,
    height: 1200,
  });
  expect(document.data.media).toEqual([
    {
      kind: "image",
      src: "/media/images/gallery/002.webp",
      alt: "Gallery image 002",
      width: 1000,
      height: 1000,
    },
  ]);
  expect(
    renderImageSet(entry, [
      { src: "/media/images/gallery/001.webp", width: 900, height: 1200 },
    ], "published"),
  ).toContain('publishedAt: "2025-11-15"');
});
