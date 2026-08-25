import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const rail = await Bun.file(new URL("src/components/FieldGuideRail.astro", root)).text();
const pages = await Promise.all(["spheres", "artifacts", "trails", "signals"].map((name) => Bun.file(new URL(`src/pages/${name}/index.astro`, root)).text()));

test("shares one field-guide rail across archive pages", () => {
  expect(rail).toContain('class="field-guide-rail"');
  expect(rail).toContain('href="/explore"');
  for (const source of pages) {
    expect(source).toContain("field-guide-grid");
    expect(source).toContain("<FieldGuideRail");
  }
});

test("keeps the field-guide pages content-first", () => {
  for (const source of pages) {
    expect(source).toContain("aria-labelledby");
    expect(source).not.toContain("Choose a starting point.");
  }
});
