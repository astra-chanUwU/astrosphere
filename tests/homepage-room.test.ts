import { expect, test } from "bun:test";

import { getHomepageSelections, homepageConfig } from "../src/config/homepage";

const homepage = await Bun.file(new URL("../src/pages/index.astro", import.meta.url)).text();

test("selects a configured focus and a unique constellation without repeating the focus", () => {
  const entries = [
    { id: "focus", data: { slug: "focus" } },
    { id: "one", data: { slug: "one" } },
    { id: "two", data: { slug: "two" } },
  ];

  expect(
    getHomepageSelections(entries, {
      focusSlug: "focus",
      constellationSlugs: ["focus", "one", "one", "missing", "two"],
    }),
  ).toEqual({
    focus: entries[0],
    constellation: [entries[1], entries[2]],
  });
});

test("keeps dedicated visual and manga selections for the homepage scrapbook", () => {
  expect(homepageConfig.visualArtifactSlugs).toEqual([
    "shirow-masamune-artworks-in-the-shell",
    "the-ghost-in-the-shell-2026",
    "strawberry-panic-old-yuri",
    "the-starry-night-1889",
  ]);
  expect(homepageConfig.mangaSlugs).toContain("tenmaku-no-jaadugar");
});

test("builds the home page around a text-led constellation and archive entrances", () => {
  expect(homepage).toContain("getHomepageSelections");
  expect(homepage).toContain('class="focus-note"');
  expect(homepage).toContain('class="archive-map"');
  expect(homepage).toContain('data-home-section="visual-scrapbook"');
  expect(homepage).toContain('data-home-section="manga-shelf"');
  expect(homepage).toContain('data-manga-rating={series.data.rating}');
  expect(homepage).toContain('class="entry-points"');
});

test("fills the sphere doorway with up to three entries", () => {
  expect(homepage).toContain("const shownSpheres = [...featuredSpheres");
  expect(homepage).toContain(".slice(0, 3)");
});
