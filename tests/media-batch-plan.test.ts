import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBatchManifest } from "../src/lib/media/batch-manifest";
import { planBatchImport } from "../src/lib/media/batch-plan";

const manifestSource = (pages = "all") => `
version: 1
defaults: { ignoreEntries: [ReadMe.txt, final.jpg] }
entries:
  - type: doujinshi
    archive: Example.zip
    mode: create
    series:
      slug: example
      title: Example
      originalTitle: Example
      aliases: []
      status: completed
      publicationYear: 2026
      description: Example description.
      rating: explicit
      origin: original
      tags: [english]
      authors: [{ name: Example, slug: example }]
      artists: [{ name: Example, slug: example }]
      featured: false
    chapters:
      - number: 1
        title: Doujinshi
        pages: ${pages}
`;

const file = (path: string) => ({ path, isDirectory: false });

test("selects pages naturally after manifest ignores and reports unlisted archives", async () => {
  const root = await mkdtemp(join(tmpdir(), "batch-plan-"));
  const source = join(root, "source");
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  await mkdir(source);
  await mkdir(projectRoot);
  await mkdir(mediaRoot);
  await writeFile(join(source, "Example.zip"), "archive");
  await writeFile(join(source, "Ignored.zip"), "archive");
  try {
    const plan = await planBatchImport(
      {
        source,
        manifest: parseBatchManifest(manifestSource(), "batch.yaml"),
        projectRoot,
        mediaRoot,
        status: "published",
      },
      {
        listEntries: async () => [
          file("10.webp"),
          file("2.webp"),
          file("final.jpg"),
          file("ReadMe.txt"),
        ],
        inspectEntry: async (entry) =>
          entry.path.endsWith(".txt") ? "unknown" : "webp",
        hashFile: async () => "archive-hash",
      },
    );

    expect(plan.entries[0]?.pages.map((page) => page.entry.path)).toEqual([
      "2.webp",
      "10.webp",
    ]);
    expect(plan.entries[0]?.ignored).toEqual(["ReadMe.txt", "final.jpg"]);
    expect(plan.unlistedArchives).toEqual(["Ignored.zip"]);
    expect(plan.entries[0]?.state).toBe("create");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maps inclusive ranges and rejects omitted accepted pages", async () => {
  const root = await mkdtemp(join(tmpdir(), "batch-plan-"));
  const source = join(root, "source");
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  await mkdir(source);
  await mkdir(projectRoot);
  await mkdir(mediaRoot);
  await writeFile(join(source, "Example.zip"), "archive");
  const adapters = {
    listEntries: async () => [file("1.jpg"), file("2.jpg"), file("3.jpg")],
    inspectEntry: async () => "jpeg" as const,
    hashFile: async () => "archive-hash",
  };
  try {
    const split = manifestSource("{ from: 1, to: 2 }").replace(
      "      - number: 1\n        title: Doujinshi\n        pages: { from: 1, to: 2 }",
      "      - { number: 1, title: Main, pages: { from: 1, to: 2 } }\n      - { number: 2, title: Special, pages: { from: 3, to: 3 } }",
    );
    const plan = await planBatchImport(
      {
        source,
        manifest: parseBatchManifest(split, "batch.yaml"),
        projectRoot,
        mediaRoot,
        status: "published",
      },
      adapters,
    );
    expect([...plan.entries[0]!.chapterPages.values()].map((pages) => pages.length)).toEqual([2, 1]);

    await expect(
      planBatchImport(
        {
          source,
          manifest: parseBatchManifest(manifestSource("{ from: 1, to: 2 }"), "batch.yaml"),
          projectRoot,
          mediaRoot,
          status: "published",
        },
        adapters,
      ),
    ).rejects.toThrow("does not assign every accepted page");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("preflight refuses create collisions without writing staging data", async () => {
  const root = await mkdtemp(join(tmpdir(), "batch-plan-"));
  const source = join(root, "source");
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  await mkdir(source);
  await mkdir(join(projectRoot, "src/content/manga/series"), { recursive: true });
  await mkdir(mediaRoot);
  await writeFile(join(source, "Example.zip"), "archive");
  await writeFile(join(projectRoot, "src/content/manga/series/example.md"), "existing");
  const before = await readdir(mediaRoot);
  try {
    await expect(
      planBatchImport(
        {
          source,
          manifest: parseBatchManifest(manifestSource(), "batch.yaml"),
          projectRoot,
          mediaRoot,
          status: "published",
        },
        {
          listEntries: async () => [file("1.jpg")],
          inspectEntry: async () => "jpeg",
          hashFile: async () => "archive-hash",
        },
      ),
    ).rejects.toThrow("already exists");
    expect(await readdir(mediaRoot)).toEqual(before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("recognizes an exact completed import before reopening archive entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "batch-plan-complete-"));
  const source = join(root, "source");
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  await mkdir(source);
  await mkdir(projectRoot);
  await mkdir(mediaRoot);
  await writeFile(join(source, "Example.zip"), "archive");
  const manifest = parseBatchManifest(manifestSource(), "batch.yaml");
  let archiveOpened = false;
  try {
    const plan = await planBatchImport(
      { source, manifest, projectRoot, mediaRoot, status: "published" },
      {
        hashFile: async () => "archive-hash",
        readRecord: async () => ({
          version: 1,
          slug: "example",
          fingerprint: (await import("../src/lib/media/batch-manifest")).fingerprintBatchEntry(
            manifest.entries[0]!,
            "archive-hash",
          ),
          outputs: [{ scope: "project", path: "output.md", sha256: "archive-hash" }],
        }),
        pathExists: async () => true,
        listEntries: async () => {
          archiveOpened = true;
          return [file("1.jpg")];
        },
        inspectEntry: async () => {
          archiveOpened = true;
          return "jpeg";
        },
      },
    );
    expect(plan.entries[0]?.state).toBe("already-complete");
    expect(archiveOpened).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
