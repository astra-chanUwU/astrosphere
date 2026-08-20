import { expect, test } from "bun:test";

const config = await Bun.file(new URL("../src/content.config.ts", import.meta.url)).text();

test("defines dedicated manga series and chapter collections", () => {
  expect(config).toContain("const mangaSeries = defineCollection");
  expect(config).toContain("const mangaChapters = defineCollection");
  expect(config).toContain('z.enum(["safe", "suggestive", "explicit"])');
  expect(config).toContain('z.enum(["manga", "doujinshi", "one-shot", "artbook", "web-comic"])');
  expect(config).toContain('z.enum(["original", "fanwork"])');
  expect(config).toContain("series: slugSchema");
  expect(config).toContain("pagePath: z.string().startsWith(\"/\")");
  expect(config).toContain("pageCount: z.number().int().positive()");
  expect(config).toContain("slug: slugSchema");
  expect(config).not.toContain("url: z.url().optional()");
});
