import { expect, test } from "bun:test";

const content = await Bun.file(new URL("../src/lib/content.ts", import.meta.url)).text();
const types = await Bun.file(new URL("../src/types/content.ts", import.meta.url)).text();

test("exposes published image-set accessors and entry types", () => {
  expect(content).toContain('getCollection("imageSets"');
  expect(content).toContain("getPublishedImageSets");
  expect(content).toContain("getImageSetBySlug");
  expect(types).toContain("imageSetSchema");
});

test("keeps only the two approved image sets in the first-class collection", async () => {
  const slugs = [];
  for await (const file of new Bun.Glob("*.md").scan(new URL("../src/content/image-sets", import.meta.url).pathname)) {
    const source = await Bun.file(new URL(file, new URL("../src/content/image-sets/", import.meta.url))).text();
    slugs.push(source.match(/^slug:\s*(.+)$/m)?.[1]?.trim());
  }
  expect(slugs.sort()).toEqual(["flou-sona", "ndgd"]);
});
