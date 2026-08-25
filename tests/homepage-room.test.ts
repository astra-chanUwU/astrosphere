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

test("keeps curated shelf selections for the homepage visual index", () => {
  expect(homepageConfig.visualArtifactSlugs).toEqual([
    "shirow-masamune-artworks-in-the-shell",
    "the-ghost-in-the-shell-2026",
    "strawberry-panic-old-yuri",
    "the-starry-night-1889",
  ]);
  expect(homepageConfig.mangaSlugs).toContain("tenmaku-no-jaadugar");
  expect(homepageConfig.shelfMangaSlugs).toEqual([
    "ghost-in-the-shell",
    "murcielago",
    "gushing-over-magical-girls",
    "witches-and-cigarettes",
  ]);
  expect(homepageConfig.shelfDoujinshiSlugs).toEqual([
    "a-hard-debut",
    "frill-no-shita-no-netsu",
  ]);
  expect(homepageConfig.shelfImageSetSlugs).toEqual(["flou-sona", "ndgd"]);
});

test("builds the home page as a two-column archive feed", () => {
  expect(homepage).toContain("getShelfSelections");
  expect(homepage).toContain('class="archive-columns"');
  expect(homepage).toContain('class="recommendations"');
  expect(homepage).toContain('class="dispatches"');
  expect(homepage).toContain('aria-labelledby="dispatches-title"');
  expect(homepage).toContain('class="dispatch-list"');
  expect(homepage).toContain("Dispatches");
  expect(homepage).toContain("Latest additions and changes in the archive.");
  expect(homepage).not.toContain('class="shelf-feed"');
  expect(homepage).not.toContain('class="shelf-content-grid"');
  expect(homepage).not.toContain('class="shelf-mosaic"');
  expect(homepage).not.toContain('class="archive-map"');
  expect(homepage).not.toContain("A place for things that deserve a second look.");
});

test("keeps recommendations and dispatches visually distinct", () => {
  expect(homepage).toContain("<MangaSeriesCard");
  expect(homepage).toContain("<ImageSetCard");
  expect(homepage).toContain("<ArtifactCard artifact={dispatch.item} visual />");
  expect(homepage).toContain('class="dispatch-item"');
  expect(homepage).toContain('class="recommendation-list"');
});

test("gives the archive a present-tense point of view", () => {
  expect(homepage).toContain('class="current-attention"');
  expect(homepage).toContain("Current attention");
  expect(homepage).toContain("Read next");
  expect(homepage).toContain("Recent sets");
  expect(homepage).toContain("New chapter");
  expect(homepage).toContain("New image set");
  expect(homepage).not.toContain("Things worth opening.");
});
