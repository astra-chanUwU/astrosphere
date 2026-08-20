import { expect, test } from "bun:test";
import { getArchivePageHref } from "../src/lib/archive";

const root = new URL("../", import.meta.url);
const pager = await Bun.file(new URL("src/components/ArchivePagination.astro", root)).text().catch(() => "");
const archive = await Bun.file(new URL("src/lib/archive.ts", root)).text().catch(() => "");
const shelfArchive = await Bun.file(new URL("src/components/ShelfArchive.astro", root)).text();
const artifactIndex = await Bun.file(new URL("src/pages/artifacts/index.astro", root)).text();
const artifactPages = await Bun.file(new URL("src/pages/artifacts/page/[page].astro", root)).text().catch(() => "");
const artifactCard = await Bun.file(new URL("src/components/ArtifactCard.astro", root)).text();
const trailIndex = await Bun.file(new URL("src/pages/trails/index.astro", root)).text();
const trailPages = await Bun.file(new URL("src/pages/trails/page/[page].astro", root)).text().catch(() => "");
const trailCard = await Bun.file(new URL("src/components/TrailCard.astro", root)).text().catch(() => "");

test("uses one accessible route-neutral archive pager", () => {
  expect(archive).toContain("export const ARCHIVE_PAGE_SIZE = 24");
  expect(archive).toContain("getArchivePageHref");
  expect(pager).toContain('aria-label="Pagination"');
  expect(pager).toContain("aria-current");
  expect(pager).toContain("Previous");
  expect(pager).toContain("Next");
  expect(pager).toContain("getArchivePageHref");
  expect(pager).not.toContain("<script");
  expect(shelfArchive).toContain("ArchivePagination");
});

test("keeps first archive pages canonical", () => {
  expect(getArchivePageHref("/artifacts", 1)).toBe("/artifacts");
  expect(getArchivePageHref("/trails", 1)).toBe("/trails");
  expect(getArchivePageHref("/artifacts", 2)).toBe("/artifacts/page/2");
  expect(getArchivePageHref("/trails", 3)).toBe("/trails/page/3");
});

test("builds Artifacts as a uniform static row archive", () => {
  expect(artifactIndex).toContain("getPublishedArtifacts");
  expect(artifactIndex).toContain("ARCHIVE_PAGE_SIZE");
  expect(artifactIndex).toContain("artifacts.slice(0, ARCHIVE_PAGE_SIZE)");
  expect(artifactIndex).toContain('basePath="/artifacts"');
  expect(artifactIndex).not.toContain("featured-artifact");
  expect(artifactIndex).not.toContain("artifact-grid");
  expect(artifactPages).toMatch(/return\s+paginate\(artifacts,\s*\{\s*pageSize:\s*ARCHIVE_PAGE_SIZE\s*\}\)\s*\.filter\(\(path\)\s*=>\s*Number\(path\.params\.page\)\s*>\s*1\)/s);
  expect(artifactCard).toContain("artifact.data.type");
  expect(artifactCard).toContain("artifact.data.summary");
  expect(artifactCard).toContain("publishedAt");
});

test("builds Trails as a globally numbered static row archive", () => {
  expect(trailIndex).toContain("ARCHIVE_PAGE_SIZE");
  expect(trailIndex).toContain("TrailCard");
  expect(trailIndex).toContain("trails.slice(0, ARCHIVE_PAGE_SIZE)");
  expect(trailIndex).toContain('basePath="/trails"');
  expect(trailPages).toMatch(/return\s+paginate\(trails,\s*\{\s*pageSize:\s*ARCHIVE_PAGE_SIZE\s*\}\)\s*\.filter\(\(path\)\s*=>\s*Number\(path\.params\.page\)\s*>\s*1\)/s);
  expect(trailPages).toContain("(page.currentPage - 1) * ARCHIVE_PAGE_SIZE");
  expect(trailCard).toContain("estimatedTime");
  expect(trailCard).toContain("items.length");
  expect(trailCard).toContain("Follow a route");
});
