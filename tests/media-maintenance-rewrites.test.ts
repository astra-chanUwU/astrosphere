import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { parseContentDocument } from "../src/lib/media/content-source";
import {
  applyTextEdits,
  planMaintenanceContentRewrites,
  verifyContentRewrite,
} from "../src/lib/media/maintenance-rewrites";

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

test("applies simultaneous edits from the end without touching overlapping names", () => {
  const source = `---
slug: set
status: published
hero:
  src: /media/images/set/a.jpg
media:
  - src: /media/images/set/a.jpg-large.png
---
![A](/media/images/set/a.jpg)
<img src="/media/images/set/a.jpg-large.png">
`;
  const legacy = "/media/images/set/a.jpg";
  const first = source.indexOf(legacy);
  const second = source.indexOf(legacy, first + legacy.length);

  const output = applyTextEdits(source, [
    {
      start: first,
      end: first + legacy.length,
      before: legacy,
      after: "/media/images/set/a.webp",
      field: "hero.src",
    },
    {
      start: second,
      end: second + legacy.length,
      before: legacy,
      after: "/media/images/set/a.webp",
      field: "body.markdown",
    },
  ]);

  expect(output.match(/\/media\/images\/set\/a\.webp/g)).toHaveLength(2);
  expect(output).toContain("/media/images/set/a.jpg-large.png");
});

test("plans exact scalar and body rewrites without reformatting content", async () => {
  const source = `---
slug: set
status: published
hero:
  src: "/media/images/set/a.jpg"
media:
  - src: '/media/images/set/a.jpg-large.png'
    poster: /media/images/set/poster.jpg
art:
  - poster: /media/images/set/art.jpg
---
![First](/media/images/set/a.jpg)
![Again](/media/images/set/a.jpg)
<img src="/media/images/set/a.jpg-large.png">

This prose mentions /media/images/set/a.jpg but is not an image reference.

\`/media/images/set/a.jpg\`
\`\`\`
/media/images/set/a.jpg
\`\`\`
`;
  const entry = parseContentDocument(source, "src/content/image-sets/set.md", "imageSets");
  const rewrites = await planMaintenanceContentRewrites(
    "/project",
    [entry],
    new Map([
      ["/media/images/set/a.jpg", "/media/images/set/a.webp"],
      ["/media/images/set/a.jpg-large.png", "/media/images/set/a.jpg-large.webp"],
      ["/media/images/set/poster.jpg", "/media/images/set/poster.webp"],
      ["/media/images/set/art.jpg", "/media/images/set/art.webp"],
    ]),
    async () => source,
  );

  expect(rewrites).toHaveLength(1);
  const [record] = rewrites;
  expect(record?.relativePath).toBe("src/content/image-sets/set.md");
  expect(record?.edits.map((edit) => edit.field)).toEqual([
    "hero.src",
    "media[0].src",
    "media[0].poster",
    "art[0].poster",
    "body.markdown",
    "body.markdown",
    "body.html",
  ]);
  expect(record?.edits.map((edit) => edit.before)).toEqual([
    "/media/images/set/a.jpg",
    "/media/images/set/a.jpg-large.png",
    "/media/images/set/poster.jpg",
    "/media/images/set/art.jpg",
    "/media/images/set/a.jpg",
    "/media/images/set/a.jpg",
    "/media/images/set/a.jpg-large.png",
  ]);
  expect(record?.edits).toEqual([...record!.edits].sort((left, right) => left.start - right.start));

  const output = applyTextEdits(source, record!.edits);
  expect(output).toContain('src: "/media/images/set/a.webp"');
  expect(output).toContain("src: '/media/images/set/a.jpg-large.webp'");
  expect(output).toContain("This prose mentions /media/images/set/a.jpg");
  expect(output).toContain("`/media/images/set/a.jpg`");
  expect(output).toContain("```\n/media/images/set/a.jpg\n```");
  expect(record?.beforeSha256).toBe(sha256(source));
  expect(record?.afterSha256).toBe(sha256(output));
  expect(verifyContentRewrite(source, record!)).toBe("pending");
  expect(verifyContentRewrite(output, record!)).toBe("already-applied");
  expect(() => verifyContentRewrite(`${source}changed`, record!)).toThrow("stale");
});

test("rewrites manga reader metadata once after every page converts to webp", async () => {
  const source = `---
slug: chapter
status: published
pagePath: /manga/book/chapter-001
pageExtension: jpg
pageCount: 2
---
`;
  const entry = parseContentDocument(source, "src/content/manga/chapters/chapter.md", "mangaChapters");

  const rewrites = await planMaintenanceContentRewrites(
    "/project",
    [entry],
    new Map([
      ["/manga/book/chapter-001/001.jpg", "/manga/book/chapter-001/001.webp"],
      ["/manga/book/chapter-001/002.jpg", "/manga/book/chapter-001/002.webp"],
    ]),
    async () => source,
  );

  expect(rewrites).toHaveLength(1);
  expect(rewrites[0]?.edits).toEqual([
    expect.objectContaining({
      before: "jpg",
      after: "webp",
      field: "pageExtension",
    }),
  ]);
});

test("rejects a manga reader whose converted pages disagree on their destination extension", async () => {
  const source = `---
slug: chapter
status: published
pagePath: /manga/book/chapter-001
pageExtension: jpg
pageCount: 2
---
`;
  const entry = parseContentDocument(source, "src/content/manga/chapters/chapter.md", "mangaChapters");

  await expect(
    planMaintenanceContentRewrites(
      "/project",
      [entry],
      new Map([
        ["/manga/book/chapter-001/001.jpg", "/manga/book/chapter-001/001.webp"],
        ["/manga/book/chapter-001/002.jpg", "/manga/book/chapter-001/002.png"],
      ]),
      async () => source,
    ),
  ).rejects.toThrow("mixed destination extensions");
});

test("rejects unsafe content source paths before attempting to read them", async () => {
  const source = `---
slug: set
status: published
hero:
  src: /media/images/set/a.jpg
---
`;
  const unsafePaths = [
    "/outside.md",
    "src/content/../outside.md",
    "outside.md",
    "src\\content\\set.md",
    "C:\\outside.md",
    "src/content//set.md",
    "src/content/./set.md",
  ];

  for (const path of unsafePaths) {
    let reads = 0;
    await expect(
      planMaintenanceContentRewrites(
        "/project",
        [
          {
            collection: "imageSets",
            path,
            data: {
              slug: "set",
              status: "published",
              hero: { src: "/media/images/set/a.jpg" },
            },
            body: "",
          },
        ],
        new Map([["/media/images/set/a.jpg", "/media/images/set/a.webp"]]),
        async () => {
          reads += 1;
          return source;
        },
      ),
    ).rejects.toThrow("Invalid content source path");
    expect(reads).toBe(0);
  }
});
