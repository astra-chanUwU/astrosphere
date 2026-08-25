import { expect, test } from "bun:test";

const explore = await Bun.file(new URL("../src/pages/explore.astro", import.meta.url)).text();
const navigation = await Bun.file(new URL("../src/config/navigation.ts", import.meta.url)).text();
const guide = await Bun.file(new URL("../docs/design-guide.md", import.meta.url)).text();

test("builds Explore as the thematic archive entry point", () => {
  expect(explore).toContain('class="explore-grid"');
  expect(explore).toContain('class="explore-rail"');
  expect(explore).toContain("SphereCard");
  expect(explore).toContain("Recent artifacts");
  expect(explore).toContain("Featured trails");
  expect(navigation).toContain('{ href: "/explore", label: "Explore" }');
});

test("documents the established AstroSphere design language", () => {
  expect(guide).toContain("AstroSphere design guide");
  expect(guide).toContain("Content comes before explanation.");
  expect(guide).toContain("--color-header-surface");
  expect(guide).toContain("MangaSeriesCard");
  expect(guide).toContain("two-column archive grid");
});
