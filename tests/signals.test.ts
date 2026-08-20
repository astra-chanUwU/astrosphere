import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const config = await Bun.file(new URL("src/content.config.ts", root)).text();
const route = await Bun.file(new URL("src/pages/signals/index.astro", root)).text().catch(() => "");

test("defines a dedicated signals collection and index route", () => {
  expect(config).toContain("const signals = defineCollection");
  expect(config).toContain('rating: z.enum(["sfw", "mixed", "nsfw"])');
  expect(config).toContain('"community"');
  expect(route).toContain("getPublishedSignals");
  expect(route).toContain('id: "community"');
});
