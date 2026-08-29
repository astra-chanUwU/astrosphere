import { expect, test } from "bun:test";
import { isNavigationItemCurrent } from "../src/config/navigation";
import { getAnimeTitlePresentation } from "../src/lib/anime-presentation";

test("keeps Anime selected throughout its title and watch routes", () => {
  expect(isNavigationItemCurrent("/anime", "/anime")).toBe(true);
  expect(isNavigationItemCurrent("/anime", "/anime/space-patrol-luluco")).toBe(true);
  expect(isNavigationItemCurrent("/anime", "/anime/space-patrol-luluco/episode-01")).toBe(true);
  expect(isNavigationItemCurrent("/anime", "/manga")).toBe(false);
  expect(isNavigationItemCurrent("/", "/anime")).toBe(false);
});

test("presents a series with a direct first-episode action and published WebM counts", () => {
  const presentation = getAnimeTitlePresentation("series", "space-patrol-luluco", [
    { data: { slug: "episode-01", kind: "episode", number: 1, variants: [{}, {}] } },
    { data: { slug: "episode-02", kind: "episode", number: 2, variants: [{}, {}] } },
    { data: { slug: "episode-03", kind: "episode", number: 3, variants: [{}, {}] } },
    { data: { slug: "episode-04", kind: "episode", number: 4, variants: [{}] } },
  ]);

  expect(presentation).toEqual({
    startHref: "/anime/space-patrol-luluco/episode-01",
    startLabel: "Start episode 1",
    itemCountLabel: "4 episodes",
    variantCountLabel: "7 WebMs",
  });
});

test("keeps a movie-style compilation player on its title page", () => {
  const presentation = getAnimeTitlePresentation("movie", "test-movie", [
    { data: { slug: "compilation", kind: "movie", variants: [{}] } },
  ]);

  expect(presentation).toEqual({
    startHref: "/anime/test-movie#watch",
    startLabel: "Watch compilation",
    itemCountLabel: "1 compilation",
    variantCountLabel: "1 WebM",
  });
});
