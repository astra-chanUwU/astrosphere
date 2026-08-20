import { expect, test } from "bun:test";

const config = await Bun.file(new URL("../src/content.config.ts", import.meta.url)).text();

test("defines a first-class image-set collection with gallery metadata", () => {
  expect(config).toContain("const imageSetSchema = z.object");
  expect(config).toContain("const imageSets = defineCollection");
  expect(config).toContain('base: "./src/content/image-sets"');
  expect(config).toContain("imageSetSchema");
  expect(config).toContain("hero: mediaSchema.optional()");
  expect(config).toContain("media: z.array(mediaSchema).default([])");
  expect(config).toContain("rating: mangaRatingSchema");
});
