import { expect, test } from "bun:test";
import { sortAnimeVideos, validateAnimeReferences } from "../src/lib/anime-references";

const title = (slug: string, kind: "series" | "movie" = "series", visibility = "published") => ({
  collection: "animeTitles" as const,
  data: { slug, kind, visibility },
});
const video = (
  slug: string,
  anime: string,
  kind: "episode" | "movie" | "extra",
  number?: number,
) => ({
  collection: "animeVideos" as const,
  data: { slug, anime, kind, number, status: "published" },
});

test("sorts numbered episodes before extras", () => {
  const values = [
    video("clean-ending", "show", "extra"),
    video("episode-2", "show", "episode", 2),
    video("episode-1", "show", "episode", 1),
  ];
  expect(sortAnimeVideos(values).map((entry) => entry.data.slug)).toEqual([
    "episode-1",
    "episode-2",
    "clean-ending",
  ]);
});

test("reports missing parents and duplicate episode numbers", () => {
  const issues = validateAnimeReferences({
    titles: [title("show")],
    videos: [
      video("episode-a", "show", "episode", 1),
      video("episode-b", "show", "episode", 1),
      video("lost", "missing", "episode", 2),
    ],
  });
  expect(issues.map((issue) => issue.code).sort()).toEqual([
    "duplicate-episode-number",
    "missing-title",
  ]);
});

test("enforces series/movie shape and published parents", () => {
  const issues = validateAnimeReferences({
    titles: [title("series"), title("movie", "movie"), title("draft-show", "series", "draft")],
    videos: [
      video("wrong-series-item", "series", "movie"),
      video("movie-a", "movie", "movie"),
      video("movie-b", "movie", "movie"),
      video("draft-episode", "draft-show", "episode", 1),
    ],
  });
  expect(issues.map((issue) => issue.code).sort()).toEqual([
    "duplicate-movie",
    "kind-mismatch",
    "unpublished-title",
  ]);
});
