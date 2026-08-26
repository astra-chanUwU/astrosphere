import { expect, test } from "bun:test";
import { parse } from "yaml";
import { animeTitleSchema, animeVideoSchema } from "../src/lib/anime-schema";

const root = new URL("../", import.meta.url);
const readFrontmatter = async (path: string) => {
  const source = await Bun.file(new URL(path, root)).text();
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`Missing frontmatter: ${path}`);
  return parse(match[1]!);
};

test("publishes the two source-backed anime titles", async () => {
  const luluco = animeTitleSchema.parse(await readFrontmatter("src/content/anime/titles/space-patrol-luluco.md"));
  const burnUp = animeTitleSchema.parse(await readFrontmatter("src/content/anime/titles/burn-up-w.md"));

  expect(luluco).toMatchObject({ kind: "series", format: "tv-short", releaseYear: 2016, visibility: "published" });
  expect(burnUp).toMatchObject({ kind: "movie", format: "ova-compilation", releaseYear: 1996, visibility: "published" });
  expect(luluco.poster?.src.startsWith("/media/anime/space-patrol-luluco/")).toBe(true);
  expect(burnUp.poster?.src.startsWith("/media/anime/burn-up-w/")).toBe(true);
  expect(burnUp.description).toMatch(/four-part|four episodes/i);
});

test("retains the complete Luluco catalog while publishing only available WebMs", async () => {
  const glob = new Bun.Glob("src/content/anime/videos/space-patrol-luluco-*.md");
  const paths = [...glob.scanSync({ cwd: new URL("..", import.meta.url).pathname })].sort();
  const videos = await Promise.all(paths.map(async (path) => animeVideoSchema.parse(await readFrontmatter(path))));
  const episodes = videos.filter((video) => video.kind === "episode");
  const extras = videos.filter((video) => video.kind === "extra");

  expect(episodes).toHaveLength(13);
  expect(extras).toHaveLength(1);
  expect(episodes.map((episode) => episode.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  for (const episode of episodes) {
    expect(episode.defaultVariant).toBe("japanese-subbed");
    expect(episode.variants.every((variant) => variant.src.startsWith("/media/anime/space-patrol-luluco/") && variant.src.endsWith(".webm"))).toBe(true);
  }
  expect(episodes.filter((episode) => episode.status === "published").map((episode) => episode.number)).toEqual([1, 2, 3, 4]);
  expect(episodes.slice(0, 3).every((episode) => episode.variants.map((variant) => variant.slug).join(",") === "japanese-subbed,english-dub")).toBe(true);
  expect(episodes[3]?.variants.map((variant) => variant.slug)).toEqual(["japanese-subbed"]);
  expect(episodes.slice(4).every((episode) => episode.status === "draft")).toBe(true);
  expect(extras[0]?.status).toBe("draft");
  expect(extras[0]?.variants).toHaveLength(1);
});

test("publishes Burn-Up W as one WebM compilation record", async () => {
  const video = animeVideoSchema.parse(await readFrontmatter("src/content/anime/videos/burn-up-w-compilation.md"));
  expect(video).toMatchObject({ anime: "burn-up-w", kind: "movie", status: "published" });
  expect(video.variants).toHaveLength(1);
  expect(video.variants[0]?.src).toBe("/media/anime/burn-up-w/videos/compilation/japanese-subbed.webm");
});
