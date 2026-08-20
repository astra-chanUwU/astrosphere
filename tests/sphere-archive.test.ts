import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const index = await Bun.file(new URL("src/pages/spheres/index.astro", root)).text();
const pages = await Bun.file(new URL("src/pages/spheres/page/[page].astro", root)).text().catch(() => "");
const card = await Bun.file(new URL("src/components/SphereCard.astro", root)).text();
const detail = await Bun.file(new URL("src/pages/spheres/[slug].astro", root)).text();

test("builds Spheres as a palette-led static territory archive", () => {
  expect(index).toContain("ARCHIVE_PAGE_SIZE");
  expect(index).toContain("orderedSpheres.slice(0, ARCHIVE_PAGE_SIZE)");
  expect(index).toContain('basePath="/spheres"');
  expect(pages).toMatch(/return\s+paginate\(spheres,\s*\{\s*pageSize:\s*ARCHIVE_PAGE_SIZE\s*\}\)\s*\.filter\(\(path\)\s*=>\s*Number\(path\.params\.page\)\s*>\s*1\)/s);
  expect(card).toContain("sphere-row");
  expect(card).toContain("childCount");
  expect(card).toContain("artifactCount");
});

test("updates sphere detail pages into territory dossiers", () => {
  expect(detail).toContain("Territory dossier");
  expect(detail).toContain("territory-header");
  expect(detail).toContain("sphere-children");
  expect(detail).not.toContain('class="children"');
});
