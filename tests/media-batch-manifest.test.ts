import { expect, test } from "bun:test";
import {
  fingerprintBatchEntry,
  parseBatchManifest,
} from "../src/lib/media/batch-manifest";

const createManifest = `
version: 1
defaults:
  ignoreEntries: [ReadMe.txt, final.jpg]
entries:
  - type: doujinshi
    archive: Example.zip
    mode: create
    series:
      slug: example
      title: Example
      originalTitle: Example Original
      aliases: []
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
`;

test("parses and normalizes a version 1 doujinshi create manifest", () => {
  const parsed = parseBatchManifest(createManifest, "batch.yaml");
  expect(parsed).toEqual({
    version: 1,
    defaults: { ignoreEntries: ["ReadMe.txt", "final.jpg"] },
    entries: [
      {
        type: "doujinshi",
        archive: "Example.zip",
        mode: "create",
        series: {
          slug: "example",
          title: "Example",
          originalTitle: "Example Original",
          aliases: [],
          status: "completed",
          publicationYear: 2026,
          description: "Example description.",
          rating: "explicit",
          origin: "original",
          tags: ["english"],
          authors: [{ name: "Example Circle", slug: "example-circle" }],
          artists: [{ name: "Example Artist", slug: "example-artist" }],
          featured: false,
        },
        chapters: [
          {
            number: 1,
            title: "Doujinshi",
            pages: "all",
            body: "The complete example.",
          },
        ],
      },
    ],
  });
});

test("parses explicit chapter replacement and image-set creation", () => {
  const parsed = parseBatchManifest(`
version: 1
defaults: { ignoreEntries: [] }
entries:
  - type: doujinshi
    archive: Existing.zip
    mode: update
    series: existing-series
    replace: true
    chapters:
      - { number: 1, title: Main, pages: { from: 1, to: 39 } }
      - { number: 2, title: Special, pages: { from: 40, to: 43 } }
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

  expect(parsed.entries[0]).toMatchObject({
    mode: "update",
    series: "existing-series",
    replace: true,
  });
  expect(parsed.entries[1]).toMatchObject({
    type: "image-set",
    imageSet: { slug: "gallery", publishedAt: "2025-11-15" },
  });
});

test("rejects unsupported versions, duplicate archives, and unsafe archive names", () => {
  expect(() =>
    parseBatchManifest("version: 2\ndefaults: { ignoreEntries: [] }\nentries: []", "bad.yaml"),
  ).toThrow("version must be 1");
  expect(() =>
    parseBatchManifest(`${createManifest}\n  - type: image-set\n    archive: Example.zip\n    mode: create\n    imageSet: {}\n`, "bad.yaml"),
  ).toThrow("archive is listed more than once");
  expect(() =>
    parseBatchManifest(createManifest.replace("Example.zip", "../Example.zip"), "bad.yaml"),
  ).toThrow("archive must be a basename");
});

test("requires explicit replacement authorization and non-overlapping ranges", () => {
  const update = `
version: 1
defaults: { ignoreEntries: [] }
entries:
  - type: doujinshi
    archive: Existing.zip
    mode: update
    series: existing-series
    chapters:
      - { number: 1, pages: { from: 1, to: 10 } }
`;
  expect(() => parseBatchManifest(update, "bad.yaml")).toThrow("replace: true");
  expect(() =>
    parseBatchManifest(
      update
        .replace("    chapters:", "    replace: true\n    chapters:")
        .replace(
          "      - { number: 1, pages: { from: 1, to: 10 } }",
          "      - { number: 1, pages: { from: 1, to: 10 } }\n      - { number: 2, pages: { from: 10, to: 20 } }",
        ),
      "bad.yaml",
    ),
  ).toThrow("page ranges overlap");
});

test("fingerprints normalized entry metadata and archive bytes deterministically", () => {
  const entry = parseBatchManifest(createManifest, "batch.yaml").entries[0]!;
  expect(fingerprintBatchEntry(entry, "archive-a")).toBe(
    fingerprintBatchEntry(entry, "archive-a"),
  );
  expect(fingerprintBatchEntry(entry, "archive-a")).not.toBe(
    fingerprintBatchEntry(entry, "archive-b"),
  );
});
