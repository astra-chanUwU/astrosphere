import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createContentTemplate,
  renderContentTemplate,
} from "../src/lib/content/templates";

const date = new Date("2026-08-23T00:00:00Z");

test("renders editable schema-shaped draft templates", () => {
  expect(renderContentTemplate("essay", "new-essay", date)).toContain(
    "slug: new-essay\ntitle: New Essay\ntype: essay\nstatus: draft",
  );
  expect(renderContentTemplate("doujinshi", "new-book", date)).toContain(
    "format: doujinshi",
  );
  expect(renderContentTemplate("image-set", "new-gallery", date)).toContain(
    "status: draft",
  );
  expect(renderContentTemplate("essay", "new-essay", date)).toContain(
    'publishedAt: "2026-08-23"',
  );
});

test("creates the correct content path and refuses overwrite", async () => {
  const root = await mkdtemp(join(tmpdir(), "content-template-"));
  try {
    const result = await createContentTemplate({
      type: "essay",
      slug: "new-essay",
      projectRoot: root,
      date,
    });
    expect(result.path).toBe(join(root, "src/content/artifacts/essays/new-essay.md"));
    expect(await readFile(result.path, "utf8")).toContain("# New Essay");
    await expect(
      createContentTemplate({
        type: "essay",
        slug: "new-essay",
        projectRoot: root,
        date,
      }),
    ).rejects.toThrow("already exists");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not replace a destination created after its parent directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "content-template-"));
  const destination = join(root, "src/content/image-sets/raced.md");
  try {
    await mkdir(join(root, "src/content/image-sets"), { recursive: true });
    await writeFile(destination, "existing");
    await expect(
      createContentTemplate({
        type: "image-set",
        slug: "raced",
        projectRoot: root,
        date,
      }),
    ).rejects.toThrow("already exists");
    expect(await readFile(destination, "utf8")).toBe("existing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
