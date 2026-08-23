import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  collectionForContentPath,
  isPublishedMediaEntry,
  loadMediaContentEntries,
  parseContentDocument,
} from "../src/lib/media/content-source";

test("parses YAML frontmatter and preserves the body", () => {
  const entry = parseContentDocument(
    "---\nslug: example\nstatus: published\nhero:\n  src: /media/images/example/cover.webp\n---\n![Page](/media/images/example/001.webp)\n",
    "src/content/image-sets/example.md",
    "imageSets",
  );

  expect(entry.data).toMatchObject({
    slug: "example",
    status: "published",
  });
  expect(entry.body).toContain("![Page]");
});

test("maps repository content paths and publication fields", () => {
  expect(collectionForContentPath("manga/series/example.md")).toBe(
    "mangaSeries",
  );
  expect(collectionForContentPath("manga/chapters/example-001.md")).toBe(
    "mangaChapters",
  );
  expect(collectionForContentPath("image-sets/example.md")).toBe("imageSets");
  expect(
    isPublishedMediaEntry({
      collection: "mangaSeries",
      path: "x",
      data: { slug: "x", visibility: "published" },
      body: "",
    }),
  ).toBe(true);
  expect(
    isPublishedMediaEntry({
      collection: "mangaChapters",
      path: "x",
      data: { slug: "x", status: "archived" },
      body: "",
    }),
  ).toBe(false);
});

test("loads supported content in stable path order", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-content-source-"));
  try {
    await mkdir(join(root, "src/content/image-sets"), { recursive: true });
    await mkdir(join(root, "src/content/manga/chapters"), {
      recursive: true,
    });
    await mkdir(join(root, "src/content/artifacts/essays"), {
      recursive: true,
    });
    await writeFile(
      join(root, "src/content/image-sets/z-set.md"),
      "---\nslug: z-set\nstatus: published\n---\n",
    );
    await writeFile(
      join(root, "src/content/manga/chapters/old.md"),
      "---\nslug: old\nstatus: archived\n---\n",
    );
    await writeFile(
      join(root, "src/content/artifacts/essays/a-note.mdx"),
      "---\nslug: a-note\nstatus: published\n---\nBody\n",
    );

    const entries = await loadMediaContentEntries(root);

    expect(entries.map((entry) => entry.path)).toEqual([
      "src/content/artifacts/essays/a-note.mdx",
      "src/content/image-sets/z-set.md",
      "src/content/manga/chapters/old.md",
    ]);
    expect(
      entries.filter(isPublishedMediaEntry).map((entry) => entry.data.slug),
    ).toEqual(["a-note", "z-set"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects malformed frontmatter with the content path", () => {
  expect(() =>
    parseContentDocument(
      "---\nslug: [broken\n---\n",
      "src/content/image-sets/broken.md",
      "imageSets",
    ),
  ).toThrow("src/content/image-sets/broken.md");
  expect(() => collectionForContentPath("manga/unexpected.md")).toThrow(
    "Unexpected manga content path",
  );
});
