import { expect, test } from "bun:test";
import { collectManagedMediaReferences } from "../src/lib/media/references";

test("collects managed frontmatter, Markdown, HTML, and reader pages", () => {
  const references = collectManagedMediaReferences([
    {
      collection: "imageSets",
      path: "set.md",
      body: '<img src="/media/images/set/002.webp">\n![One](/media/images/set/001.webp)',
      data: {
        slug: "set",
        status: "published",
        hero: { src: "/media/images/set/cover.webp" },
      },
    },
    {
      collection: "mangaSeries",
      path: "book.md",
      body: "",
      data: {
        slug: "book",
        visibility: "published",
        format: "doujinshi",
      },
    },
    {
      collection: "mangaChapters",
      path: "chapter.md",
      body: "",
      data: {
        slug: "chapter",
        series: "book",
        status: "published",
        pagePath: "/manga/book/chapter-001",
        pageExtension: "webp",
        pageCount: 2,
      },
    },
  ]);

  expect(references.map(({ publicPath }) => publicPath)).toEqual([
    "/media/images/set/cover.webp",
    "/media/images/set/001.webp",
    "/media/images/set/002.webp",
    "/manga/book/chapter-001/001.webp",
    "/manga/book/chapter-001/002.webp",
    "/manga/book/chapter-001/thumbnails/001.webp",
    "/manga/book/chapter-001/thumbnails/002.webp",
  ]);
});

test("requires cover artwork and page thumbnails for regular manga", () => {
  const references = collectManagedMediaReferences([
    {
      collection: "mangaSeries",
      path: "book.md",
      body: "",
      data: {
        slug: "book",
        visibility: "published",
        format: "manga",
        cover: { src: "/manga/book/cover.webp" },
        art: [{ src: "/media/images/book/art.webp" }],
      },
    },
    {
      collection: "mangaChapters",
      path: "chapter.md",
      body: "",
      data: {
        slug: "chapter",
        series: "book",
        status: "published",
        pagePath: "/manga/book/chapter-001",
        pageExtension: "webp",
        pageCount: 1,
      },
    },
  ]);

  expect(references.map(({ publicPath }) => publicPath)).toEqual([
    "/media/images/book/art.webp",
    "/manga/book/cover.webp",
    "/manga/book/thumbnails/cover.webp",
    "/manga/book/thumbnails/art/001.webp",
    "/manga/book/chapter-001/001.webp",
    "/manga/book/chapter-001/thumbnails/001.webp",
  ]);
});

test("does not require media referenced only by archived entries", () => {
  expect(
    collectManagedMediaReferences([
      {
        collection: "mangaChapters",
        path: "old.md",
        body: "",
        data: {
          slug: "old",
          status: "archived",
          pagePath: "/manga/old",
          pageExtension: "webp",
          pageCount: 1,
        },
      },
    ]),
  ).toEqual([]);
});

test("collects only src and poster fields and deduplicates exact references", () => {
  const references = collectManagedMediaReferences([
    {
      collection: "artifacts",
      path: "artifact.md",
      body: "![Duplicate](/media/images/set/one.webp)\n![Duplicate](/media/images/set/one.webp)",
      data: {
        slug: "artifact",
        status: "published",
        summary: "/media/images/not-a-reference.webp",
        media: [
          {
            src: "/media/images/set/one.webp",
            poster: "/media/images/set/poster.webp",
          },
        ],
      },
    },
  ]);

  expect(references).toEqual([
    {
      source: "artifact.md",
      field: "media[0].poster",
      publicPath: "/media/images/set/poster.webp",
    },
    {
      source: "artifact.md",
      field: "media[0].src",
      publicPath: "/media/images/set/one.webp",
    },
    {
      source: "artifact.md",
      field: "body.markdown",
      publicPath: "/media/images/set/one.webp",
    },
  ]);
});

test("allows published unavailable chapters with no reader fields", () => {
  expect(
    collectManagedMediaReferences([
      {
        collection: "mangaChapters",
        path: "unavailable.md",
        body: "",
        data: { slug: "unavailable", status: "published" },
      },
    ]),
  ).toEqual([]);
});

test("rejects incomplete published reader metadata", () => {
  expect(() =>
    collectManagedMediaReferences([
      {
        collection: "mangaChapters",
        path: "broken.md",
        body: "",
        data: {
          slug: "broken",
          status: "published",
          pagePath: "/manga/broken",
          pageCount: 0,
        },
      },
    ]),
  ).toThrow("broken.md");
});
