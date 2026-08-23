import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readManifest, readState } from "../src/lib/media/maintenance-manifest";
import { parseContentDocument } from "../src/lib/media/content-source";
import {
  MaintenancePlanError,
  planMediaMaintenance,
} from "../src/lib/media/maintenance-plan";
import { scanManagedMedia } from "../src/lib/media/validator";
import type { MaintenanceManifestV1 } from "../src/lib/media/maintenance-types";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const gif = new TextEncoder().encode("GIF89a");
const webp = new TextEncoder().encode("RIFF1234WEBP");
const avif = new Uint8Array([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70,
  0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0,
  0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0,
]);

const withFixture = async (
  operation: (fixture: { projectRoot: string; mediaRoot: string }) => Promise<void>,
): Promise<void> => {
  const root = await mkdtemp(join(tmpdir(), "media-maintenance-plan-"));
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  try {
    await mkdir(join(projectRoot, "src/content/image-sets"), { recursive: true });
    await mkdir(join(projectRoot, "src/content/manga/chapters"), { recursive: true });
    await mkdir(join(mediaRoot, "images/set"), { recursive: true });
    await mkdir(join(mediaRoot, "manga/book/chapter-001"), { recursive: true });
    await writeFile(join(mediaRoot, "images/set/hero.jpg"), jpeg);
    await writeFile(join(mediaRoot, "images/set/body.png"), png);
    await writeFile(join(mediaRoot, "images/set/gallery.gif"), gif);
    await writeFile(join(mediaRoot, "images/set/still.avif"), avif);
    await writeFile(join(mediaRoot, "images/set/orphan.webp"), webp);
    await writeFile(join(mediaRoot, "images/set/orphan.png"), png);
    await writeFile(join(mediaRoot, "manga/book/chapter-001/001.webp"), webp);
    await writeFile(
      join(projectRoot, "src/content/image-sets/set.md"),
      `---
slug: set
status: published
hero:
  src: /media/images/set/hero.jpg
media:
  - src: /media/images/set/gallery.gif
  - src: /media/images/set/still.avif
---
![Body](/media/images/set/body.png)
`,
    );
    await writeFile(
      join(projectRoot, "src/content/manga/chapters/book-001.md"),
      `---
slug: book-001
status: published
pagePath: /manga/book/chapter-001
pageExtension: webp
pageCount: 1
---
`,
    );
    await operation({ projectRoot, mediaRoot });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test("plans sorted legacy conversions and orphan deletions while leaving WebP and AVIF unchanged", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const result = await planMediaMaintenance(
      { projectRoot, mediaRoot, quality: 85 },
      {
        now: () => new Date("2026-08-23T12:00:00.000Z"),
        randomBytes: () => "a1b2c3d4",
        availableBytes: async () => Number.MAX_SAFE_INTEGER,
      },
    );

    expect(result.status).toBe("planned");
    if (result.status !== "planned") throw new Error("expected a plan");
    expect(result.operationId).toBe("20260823t120000z-a1b2c3d4");
    const manifest = await readManifest(mediaRoot, result.operationId);
    expect(manifest.conversions.map((item) => item.sourcePublicPath)).toEqual([
      "/media/images/set/body.png",
      "/media/images/set/gallery.gif",
      "/media/images/set/hero.jpg",
    ]);
    expect(manifest.conversions.map((item) => item.destinationPublicPath)).toEqual([
      "/media/images/set/body.webp",
      "/media/images/set/gallery.webp",
      "/media/images/set/hero.webp",
    ]);
    expect(manifest.deletions.map((item) => [item.publicPath, item.reason])).toEqual([
      ["/media/images/set/body.png", "replaced-original"],
      ["/media/images/set/gallery.gif", "replaced-original"],
      ["/media/images/set/hero.jpg", "replaced-original"],
      ["/media/images/set/orphan.png", "orphan"],
      ["/media/images/set/orphan.webp", "orphan"],
    ]);
    expect(JSON.stringify(manifest)).not.toContain("still.avif");
    expect(JSON.stringify(manifest)).not.toContain("001.webp");
    expect(manifest.contentRewrites.map((item) => item.relativePath)).toEqual([
      "src/content/image-sets/set.md",
    ]);
    expect(manifest.destinationChecks.map((item) => item.publicPath)).toEqual([
      "/media/images/set/body.webp",
      "/media/images/set/gallery.webp",
      "/media/images/set/hero.webp",
    ]);
    expect(manifest.validatorBaseline).toEqual({
      files: 7,
      bytes: 74,
      references: 5,
      errors: 0,
      orphans: 2,
    });
    expect(manifest.expectedIntermediateTotals).toEqual({
      files: 10,
      bytes: 92,
      references: 5,
      errors: 0,
      orphans: 5,
    });
    expect(manifest.expectedFinalTotals).toEqual({
      files: 5,
      bytes: 54,
      references: 5,
      errors: 0,
      orphans: 0,
    });
    expect(result.summary).toEqual({
      conversions: 3,
      deletions: 5,
      contentRewrites: 1,
      sourceBytes: 18,
      deletionBytes: 38,
    });
    expect((await readState(mediaRoot, result.operationId)).phase).toBe("planned");
  });
});

test("uses one shared scan and hashes only conversions, orphans, and affected content", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    let scans = 0;
    const hashed: string[] = [];
    const result = await planMediaMaintenance(
      { projectRoot, mediaRoot, quality: 85 },
      {
        scanMedia: async (root) => {
          scans += 1;
          return scanManagedMedia(root);
        },
        hashFile: async (path) => {
          hashed.push(path);
          return createHash("sha256").update(await readFile(path)).digest("hex");
        },
        now: () => new Date("2026-08-23T12:00:00.000Z"),
        randomBytes: () => "11223344",
        availableBytes: async () => Number.MAX_SAFE_INTEGER,
      },
    );

    expect(result.status).toBe("planned");
    expect(scans).toBe(1);
    expect(hashed.map((path) => path.slice(path.startsWith(projectRoot) ? projectRoot.length : mediaRoot.length)).sort()).toEqual([
      "/images/set/body.png",
      "/images/set/gallery.gif",
      "/images/set/hero.jpg",
      "/images/set/orphan.png",
      "/images/set/orphan.webp",
      "/src/content/image-sets/set.md",
    ]);
  });
});

test("returns clean without hashing, capacity checks, or private operation records", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-maintenance-clean-"));
  const projectRoot = join(root, "project");
  const mediaRoot = join(root, "media");
  try {
    await mkdir(join(projectRoot, "src/content/image-sets"), { recursive: true });
    await mkdir(join(mediaRoot, "images/set"), { recursive: true });
    await mkdir(join(mediaRoot, "manga"), { recursive: true });
    await writeFile(join(mediaRoot, "images/set/ready.webp"), webp);
    await writeFile(
      join(projectRoot, "src/content/image-sets/set.md"),
      `---\nslug: set\nstatus: published\nhero:\n  src: /media/images/set/ready.webp\n---\n`,
    );
    const result = await planMediaMaintenance(
      { projectRoot, mediaRoot, quality: 85 },
      {
        hashFile: async () => { throw new Error("clean plans must not hash"); },
        availableBytes: async () => { throw new Error("clean plans must not check capacity"); },
      },
    );
    expect(result).toEqual({
      status: "clean",
      baseline: { files: 1, bytes: 12, references: 1, errors: 0, orphans: 0 },
    });
    expect(await readdir(mediaRoot)).toEqual(["images", "manga"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses insufficient capacity before creating a manifest or state", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    let writes = 0;
    try {
      await planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          availableBytes: async () => 64 * 1024 * 1024,
          writeManifest: async () => { writes += 1; },
          writeState: async () => { writes += 1; },
        },
      );
      throw new Error("expected insufficient capacity");
    } catch (error) {
      expect(error).toBeInstanceOf(MaintenancePlanError);
      expect((error as MaintenancePlanError).code).toBe("insufficient-space");
    }
    expect(writes).toBe(0);
    expect((await readdir(mediaRoot)).sort()).toEqual([".astrosphere", "images", "manga"]);
    expect(await readdir(join(mediaRoot, ".astrosphere/maintenance"))).toEqual([]);
  });
});

test("refuses a conversion source that changes after the shared snapshot", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    let writes = 0;
    try {
      await planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          afterSnapshot: async () => {
            await writeFile(
              join(mediaRoot, "images/set/hero.jpg"),
              new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4]),
            );
          },
          availableBytes: async () => Number.MAX_SAFE_INTEGER,
          writeManifest: async () => { writes += 1; },
          writeState: async () => { writes += 1; },
        },
      );
      throw new Error("expected changed candidate refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(MaintenancePlanError);
      expect((error as MaintenancePlanError).code).toBe("candidate-changed");
    }
    expect(writes).toBe(0);
  });
});

test("refuses affected content that changes during its single hash", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const contentPath = join(projectRoot, "src/content/image-sets/set.md");
    let writes = 0;
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          hashFile: async (path) => {
            const bytes = await readFile(path);
            const hash = createHash("sha256").update(bytes).digest("hex");
            if (path === contentPath) await writeFile(path, new Uint8Array([...bytes, 0x0a]));
            return hash;
          },
          availableBytes: async () => Number.MAX_SAFE_INTEGER,
          writeManifest: async () => { writes += 1; },
          writeState: async () => { writes += 1; },
        },
      ),
    ).rejects.toMatchObject({ code: "content-changed" });
    expect(writes).toBe(0);
  });
});

test("revalidates candidate identity and hash after the capacity check", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const sourcePath = join(mediaRoot, "images/set/hero.jpg");
    let writes = 0;
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          availableBytes: async () => {
            await writeFile(sourcePath, new Uint8Array([0xff, 0xd8, 0xff, 0x7f, 0x01]));
            return Number.MAX_SAFE_INTEGER;
          },
          writeManifest: async () => { writes += 1; },
          writeState: async () => { writes += 1; },
        },
      ),
    ).rejects.toMatchObject({ code: "candidate-changed" });
    expect(writes).toBe(0);
  });
});

test("rejects candidate A changing while candidate B receives its sole hash", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const candidateA = join(mediaRoot, "images/set/body.png");
    const candidateB = join(mediaRoot, "images/set/gallery.gif");
    const counts = new Map<string, number>();
    let writes = 0;
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          hashFile: async (path) => {
            counts.set(path, (counts.get(path) ?? 0) + 1);
            if (counts.get(path)! > 1) throw new Error(`duplicate hash: ${path}`);
            if (path === candidateB) {
              const before = await readFile(candidateA);
              await writeFile(candidateA, new Uint8Array([...before, 0]));
            }
            return createHash("sha256").update(await readFile(path)).digest("hex");
          },
          availableBytes: async () => Number.MAX_SAFE_INTEGER,
          writeManifest: async () => { writes += 1; },
          writeState: async () => { writes += 1; },
        },
      ),
    ).rejects.toMatchObject({ code: "candidate-changed" });
    expect([...counts.values()]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(writes).toBe(0);
  });
});

test("checks capacity on the safely established private maintenance directory", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    let checkedPath = "";
    const result = await planMediaMaintenance(
      { projectRoot, mediaRoot, quality: 85 },
      {
        now: () => new Date("2026-08-23T12:00:00.000Z"),
        randomBytes: () => "99887766",
        availableBytes: async (path) => {
          checkedPath = path;
          const info = await lstat(path);
          expect(info.isDirectory()).toBe(true);
          expect(info.isSymbolicLink()).toBe(false);
          return Number.MAX_SAFE_INTEGER;
        },
      },
    );

    expect(result.status).toBe("planned");
    expect(checkedPath).toBe(join(mediaRoot, ".astrosphere/maintenance"));
  });
});

test("rejects private maintenance directory substitution after the capacity check", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    let destinationChecks = 0;
    let writes = 0;
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          availableBytes: async () => Number.MAX_SAFE_INTEGER,
          pathExists: async () => {
            destinationChecks += 1;
            if (destinationChecks === 4) {
              const directory = join(mediaRoot, ".astrosphere/maintenance");
              await rename(directory, join(mediaRoot, ".astrosphere/held-maintenance"));
              await mkdir(directory);
            }
            return false;
          },
          writeManifest: async () => { writes += 1; },
          writeState: async () => { writes += 1; },
        },
      ),
    ).rejects.toMatchObject({ code: "private-path-changed" });
    expect(writes).toBe(0);
  });
});

test("rechecks absent destinations immediately before manifest publication", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    let writes = 0;
    try {
      await planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          availableBytes: async () => {
            await writeFile(join(mediaRoot, "images/set/hero.webp"), webp);
            return Number.MAX_SAFE_INTEGER;
          },
          writeManifest: async () => { writes += 1; },
          writeState: async () => { writes += 1; },
        },
      );
      throw new Error("expected destination race refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(MaintenancePlanError);
      expect((error as MaintenancePlanError).code).toBe("destination-collision");
    }
    expect(writes).toBe(0);
  });
});

test("rejects exact, case-folded, and NFC destination collisions without choosing a new name", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    await writeFile(join(mediaRoot, "images/set/HERO.WEBP"), webp);
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        { availableBytes: async () => Number.MAX_SAFE_INTEGER },
      ),
    ).rejects.toMatchObject({ code: "destination-collision" });
  });

  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const contentPath = join(projectRoot, "src/content/image-sets/set.md");
    const source = await readFile(contentPath, "utf8");
    await writeFile(join(mediaRoot, "images/set/hero.png"), png);
    await writeFile(
      contentPath,
      source.replace(
        "  - src: /media/images/set/still.avif",
        "  - src: /media/images/set/still.avif\n  - src: /media/images/set/hero.png",
      ),
    );
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        { availableBytes: async () => Number.MAX_SAFE_INTEGER },
      ),
    ).rejects.toMatchObject({ code: "destination-collision" });
  });

  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const composed = "caf\u00e9.jpg";
    const decomposed = "cafe\u0301.jpg";
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          scanMedia: async (root) => {
            const snapshot = await scanManagedMedia(root);
            return {
              ...snapshot,
              files: [
                ...snapshot.files,
                {
                  filePath: join(mediaRoot, "images/set", composed),
                  publicPath: `/media/images/set/${composed}`,
                  relativePath: `images/set/${composed}`,
                  bytes: 4,
                  mtimeMs: 1,
                  format: "jpeg",
                  device: 1,
                  inode: 100,
                },
                {
                  filePath: join(mediaRoot, "images/set", decomposed),
                  publicPath: `/media/images/set/${decomposed}`,
                  relativePath: `images/set/${decomposed}`,
                  bytes: 4,
                  mtimeMs: 1,
                  format: "jpeg",
                  device: 1,
                  inode: 101,
                },
              ],
            };
          },
          availableBytes: async () => Number.MAX_SAFE_INTEGER,
        },
      ),
    ).rejects.toMatchObject({ code: "portable-name-collision" });
  });
});

test("rejects escaped references, out-of-tree content paths, and symlinked content", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          loadContentEntries: async () => [{
            collection: "imageSets",
            path: "src/content/image-sets/set.md",
            data: {
              slug: "set",
              status: "published",
              hero: { src: "/media/images/../outside.jpg" },
            },
            body: "",
          }],
        },
      ),
    ).rejects.toMatchObject({ code: "reference-path-unsafe" });

    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          loadContentEntries: async () => [{
            collection: "imageSets",
            path: "outside.md",
            data: {
              slug: "set",
              status: "published",
              hero: { src: "/media/images/set/hero.jpg" },
            },
            body: "",
          }],
        },
      ),
    ).rejects.toMatchObject({ code: "content-path-unsafe" });
  });

  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const contentPath = join(projectRoot, "src/content/image-sets/set.md");
    const redirected = join(projectRoot, "redirected.md");
    const source = await readFile(contentPath, "utf8");
    const entry = parseContentDocument(source, "src/content/image-sets/set.md", "imageSets");
    await writeFile(redirected, source);
    await rm(contentPath);
    await symlink(redirected, contentPath);
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          loadContentEntries: async () => [entry],
          availableBytes: async () => Number.MAX_SAFE_INTEGER,
        },
      ),
    ).rejects.toMatchObject({ code: "content-path-unsafe" });
  });
});

test("rejects approved root identity changes before manifest creation", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    let changed = false;
    let writes = 0;
    await expect(
      planMediaMaintenance(
        { projectRoot, mediaRoot, quality: 85 },
        {
          statPath: async (path) => {
            const info = await lstat(path);
            return {
              isDirectory: () => info.isDirectory(),
              isFile: () => info.isFile(),
              isSymbolicLink: () => info.isSymbolicLink(),
              dev: changed && info.isDirectory() ? info.dev + 1 : info.dev,
              ino: info.ino,
              size: info.size,
              mtimeMs: info.mtimeMs,
            };
          },
          afterSnapshot: () => { changed = true; },
          availableBytes: async () => Number.MAX_SAFE_INTEGER,
          writeManifest: async () => { writes += 1; },
          writeState: async () => { writes += 1; },
        },
      ),
    ).rejects.toMatchObject({ code: "root-changed" });
    expect(writes).toBe(0);
  });
});

test("builds byte-for-byte deterministic manifests from the same snapshot", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const manifests: MaintenanceManifestV1[] = [];
    const adapters = {
      now: () => new Date("2026-08-23T12:00:00.000Z"),
      randomBytes: () => "deadbeef",
      availableBytes: async () => Number.MAX_SAFE_INTEGER,
      writeManifest: async (_root: string, manifest: MaintenanceManifestV1) => {
        manifests.push(structuredClone(manifest));
      },
      writeState: async () => {},
    };
    const first = await planMediaMaintenance({ projectRoot, mediaRoot, quality: 91 }, adapters);
    const second = await planMediaMaintenance({ projectRoot, mediaRoot, quality: 91 }, adapters);

    expect(first).toEqual(second);
    expect(manifests).toHaveLength(2);
    expect(JSON.stringify(manifests[0])).toBe(JSON.stringify(manifests[1]));
  });
});

test("publishes every manifest array in locale-independent code-unit order", async () => {
  await withFixture(async ({ projectRoot, mediaRoot }) => {
    const setPath = join(projectRoot, "src/content/image-sets/set.md");
    const source = await readFile(setPath, "utf8");
    const accented = "\u00c9clair.png";
    await writeFile(join(mediaRoot, "images/set/Zed.jpg"), jpeg);
    await writeFile(join(mediaRoot, "images/set", accented), png);
    await writeFile(
      setPath,
      source.replace(
        "  - src: /media/images/set/still.avif",
        `  - src: /media/images/set/still.avif\n  - src: /media/images/set/Zed.jpg\n  - src: /media/images/set/${accented}`,
      ),
    );
    await writeFile(
      join(projectRoot, "src/content/image-sets/Zed.md"),
      `---\nslug: zed\nstatus: published\nhero:\n  src: /media/images/set/hero.jpg\n---\n`,
    );

    const result = await planMediaMaintenance(
      { projectRoot, mediaRoot, quality: 85 },
      {
        now: () => new Date("2026-08-23T12:00:00.000Z"),
        randomBytes: () => "abcdef12",
        availableBytes: async () => Number.MAX_SAFE_INTEGER,
      },
    );
    expect(result.status).toBe("planned");
    if (result.status !== "planned") throw new Error("expected a plan");
    const manifest = await readManifest(mediaRoot, result.operationId);
    expect(manifest.conversions.map((item) => item.sourcePublicPath)).toEqual([
      "/media/images/set/Zed.jpg",
      "/media/images/set/body.png",
      "/media/images/set/gallery.gif",
      "/media/images/set/hero.jpg",
      `/media/images/set/${accented}`,
    ]);
    expect(manifest.deletions.map((item) => item.publicPath)).toEqual([
      "/media/images/set/Zed.jpg",
      "/media/images/set/body.png",
      "/media/images/set/gallery.gif",
      "/media/images/set/hero.jpg",
      "/media/images/set/orphan.png",
      "/media/images/set/orphan.webp",
      `/media/images/set/${accented}`,
    ]);
    expect(manifest.contentRewrites.map((item) => item.relativePath)).toEqual([
      "src/content/image-sets/Zed.md",
      "src/content/image-sets/set.md",
    ]);
    expect(manifest.destinationChecks.map((item) => item.publicPath)).toEqual([
      "/media/images/set/Zed.webp",
      "/media/images/set/body.webp",
      "/media/images/set/gallery.webp",
      "/media/images/set/hero.webp",
      "/media/images/set/\u00c9clair.webp",
    ]);
    expect(manifest.conversions.find((item) => item.sourcePublicPath.endsWith("hero.jpg"))?.references).toEqual([
      { source: "src/content/image-sets/Zed.md", field: "hero.src" },
      { source: "src/content/image-sets/set.md", field: "hero.src" },
    ]);
    expect(accented).toBe(accented.normalize("NFC"));
  });
});
