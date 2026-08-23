import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatMediaValidationReport,
  validateMedia,
} from "../src/lib/media/validator";

const webp = new TextEncoder().encode("RIFF1234WEBP");
const gif = new TextEncoder().encode("GIF89a");

test("reports missing referenced files once per source field", async () => {
  const reference = {
    source: "mangaChapters:one",
    field: "pages[1]",
    publicPath: "/manga/one/001.webp",
  };
  const report = await validateMedia({
    root: "/media",
    references: [reference, reference],
    walkManagedFiles: async () => [],
    inspectFile: async () => ({ kind: "missing" }),
  });

  expect(report.errors).toHaveLength(1);
  expect(report.errors[0]).toMatchObject({
    code: "missing",
    publicPath: "/manga/one/001.webp",
  });
});

test("reports extension mismatches and corrupt known image files", async () => {
  const reference = {
    source: "imageSets:set",
    field: "media[0].src",
    publicPath: "/media/images/set/a.webp",
  };
  const mismatch = await validateMedia({
    root: "/media",
    references: [reference],
    walkManagedFiles: async () => ["/media/images/set/a.webp"],
    inspectFile: async () => ({ kind: "file", format: "png", bytes: 10 }),
  });
  expect(mismatch.errors[0]?.code).toBe("format-mismatch");

  const corrupt = await validateMedia({
    root: "/media",
    references: [reference],
    walkManagedFiles: async () => ["/media/images/set/a.webp"],
    inspectFile: async () => ({ kind: "file", format: "unknown", bytes: 2 }),
  });
  expect(corrupt.errors[0]?.code).toBe("corrupt");
});

test("reports only valid unreferenced managed files as orphans", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-validator-"));
  try {
    const referenced = join(root, "manga/book/001.webp");
    const orphan = join(root, "images/set/unused.gif");
    const privateRecord = join(root, ".astrosphere/prune.json");
    await mkdir(join(root, "manga/book"), { recursive: true });
    await mkdir(join(root, "images/set"), { recursive: true });
    await mkdir(join(root, ".astrosphere"), { recursive: true });
    await writeFile(referenced, webp);
    await writeFile(orphan, gif);
    await writeFile(privateRecord, "private");
    const inspections = new Map<string, number>();

    const report = await validateMedia({
      root,
      references: [
        {
          source: "one.md",
          field: "hero.src",
          publicPath: "/manga/book/001.webp",
        },
        {
          source: "two.md",
          field: "media[0].src",
          publicPath: "/manga/book/001.webp",
        },
      ],
      inspectFile: async (path) => {
        inspections.set(path, (inspections.get(path) ?? 0) + 1);
        return path.endsWith(".gif")
          ? { kind: "file" as const, format: "gif" as const, bytes: 6 }
          : { kind: "file" as const, format: "webp" as const, bytes: 12 };
      },
    });

    expect(report).toMatchObject({ references: 2, files: 2, errors: [] });
    expect(report.orphans).toEqual([
      {
        publicPath: "/media/images/set/unused.gif",
        filePath: orphan,
        bytes: 6,
      },
    ]);
    expect(inspections.get(referenced)).toBe(1);
    expect(inspections.has(privateRecord)).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsafe discovered entries and does not call them orphans", async () => {
  const root = await mkdtemp(join(tmpdir(), "media-validator-"));
  try {
    await mkdir(join(root, "images/set"), { recursive: true });
    await symlink("/tmp", join(root, "images/set/link.webp"));

    const report = await validateMedia({ root, references: [] });

    expect(report.errors[0]).toMatchObject({
      code: "unsafe",
      publicPath: "/media/images/set/link.webp",
    });
    expect(report.orphans).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("formats errors before orphan warnings with a stable summary", () => {
  const output = formatMediaValidationReport({
    references: 1,
    files: 1,
    errors: [
      {
        code: "missing",
        source: "chapter.md",
        field: "pages[1]",
        publicPath: "/manga/book/001.webp",
        message: "Missing media file",
      },
    ],
    orphans: [
      {
        publicPath: "/media/images/unused.webp",
        filePath: "/media/images/unused.webp",
        bytes: 12,
      },
    ],
  });

  expect(output).toBe(
    "ERROR [missing] /manga/book/001.webp (chapter.md pages[1]): Missing media file\n" +
      "WARNING [orphan] /media/images/unused.webp (12 bytes)\n" +
      "References: 1 | Files: 1 | Errors: 1 | Orphans: 1",
  );
});
