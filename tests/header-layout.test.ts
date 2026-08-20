import { expect, test } from "bun:test";

const header = await Bun.file(new URL("../src/components/SiteHeader.astro", import.meta.url)).text();

test("uses one compact horizontal inset for the logo and navigation", () => {
  expect(header).toContain("--header-gutter:.65rem");
  expect(header).toContain("padding:var(--space-2) var(--header-gutter)");
  expect(header).toContain("padding:.3rem var(--header-gutter)");
});

test("uses shared major destinations instead of archive collection links", () => {
  expect(header).toContain("primaryNavigation");
  expect(header).toContain("{primaryNavigation.map((link)");
  expect(header).not.toContain('label: "Artifacts"');
  expect(header).not.toContain('label: "Signals"');
});

test("separates search and external watchlist utilities from primary navigation", () => {
  expect(header).toContain("utilityNavigation");
  expect(header).toContain("utilityNavigation.map");
  expect(header).toContain('class="search-icon"');
  expect(header).toContain('class="external-indicator"');
});

test("uses visible thumb-first grids on phones", () => {
  expect(header).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
  expect(header).toContain("grid-template-columns:repeat(3,minmax(0,1fr))");
  expect(header).not.toContain("overflow-x:auto");
});
