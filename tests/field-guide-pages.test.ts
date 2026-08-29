import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const rail = await Bun.file(new URL("src/components/FieldGuideRail.astro", root)).text();
const pages = await Promise.all(["topics", "articles", "paths", "links"].map((name) => Bun.file(new URL(`src/pages/${name}/index.astro`, root)).text()));
const pathsIndex = await Bun.file(new URL("src/pages/paths/index.astro", root)).text().catch(() => "");
const pathsDetail = await Bun.file(new URL("src/pages/paths/[slug].astro", root)).text().catch(() => "");
const pathsPages = await Bun.file(new URL("src/pages/paths/page/[page].astro", root)).text().catch(() => "");
const legacyGuides = await Bun.file(new URL("src/pages/guides/index.astro", root)).text();
const legacyTrails = await Bun.file(new URL("src/pages/trails/index.astro", root)).text();

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

test("uses Paths as the canonical public name and route", () => {
  expect(pathsIndex).toContain('title="Paths"');
  expect(pathsIndex).toContain('basePath="/paths"');
  expect(pathsDetail).toContain('href="/paths"');
  expect(pathsPages).toContain('basePath="/paths"');
  expect(rail).toContain('label: "Paths", href: "/paths"');
  expect(legacyGuides).toContain('Astro.redirect("/paths"');
  expect(legacyTrails).toContain('Astro.redirect("/paths"');
});
