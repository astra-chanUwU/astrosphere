import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const artifacts = await Bun.file(new URL("src/pages/artifacts/index.astro", root)).text();
const trails = await Bun.file(new URL("src/pages/trails/index.astro", root)).text();

test("archive indexes expose stable server-rendered archive landmarks", () => {
  expect(artifacts).toContain("ArchivePagination");
  expect(artifacts).toContain("ArtifactCard");
  expect(trails).toContain("ArchivePagination");
  expect(trails).toContain("TrailCard");
});
