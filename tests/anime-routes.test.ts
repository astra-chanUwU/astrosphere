import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const read = async (path: string) =>
  Bun.file(new URL(path, root)).text().catch(() => "");

test("builds canonical anime title and variant watch URLs", async () => {
  const routes = await import("../src/lib/anime-routes");
  expect(routes.getAnimePublicPath("space-patrol-luluco")).toBe(
    "/anime/space-patrol-luluco",
  );
  expect(
    routes.getAnimeWatchPath(
      "space-patrol-luluco",
      "episode-01",
      "japanese-subbed",
      "japanese-subbed",
    ),
  ).toBe("/anime/space-patrol-luluco/episode-01");
  expect(
    routes.getAnimeWatchPath(
      "space-patrol-luluco",
      "episode-01",
      "english-dub",
      "japanese-subbed",
    ),
  ).toBe("/anime/space-patrol-luluco/episode-01/english-dub");
});

test("uses published anime content to generate static title and watch routes", async () => {
  const [title, watch, variant] = await Promise.all([
    read("src/pages/anime/[slug]/index.astro"),
    read("src/pages/anime/[slug]/[video].astro"),
    read("src/pages/anime/[slug]/[video]/[variant].astro"),
  ]);

  expect(title).toContain("getPublishedAnimeTitles");
  expect(title).toContain("getAnimeVideosForTitle");
  expect(title).toContain('title.data.kind === "movie"');
  expect(title).toContain("<AnimePlayer");
  expect(watch).toContain("getPublishedAnimeTitles");
  expect(watch).toContain("getPublishedAnimeVideos");
  expect(watch).toContain("<AnimeWatchPage");
  expect(variant).toContain("getPublishedAnimeTitles");
  expect(variant).toContain("getPublishedAnimeVideos");
  expect(variant).toContain("getAnimeVideoVariant");
  expect(variant).toContain("<AnimeWatchPage");
});

test("renders an anime archive and integrates anime into tag results", async () => {
  const [archive, tag] = await Promise.all([
    read("src/pages/anime/index.astro"),
    read("src/pages/tags/[tag].astro"),
  ]);
  expect(archive).toContain("getPublishedAnimeTitles");
  expect(archive).toContain("<AnimeCard");
  expect(tag).toContain("AnimeCard");
  expect(tag).toContain("anime.length");
});
