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

test("publishes the source-backed anime title", async () => {
  const luluco = animeTitleSchema.parse(await readFrontmatter("src/content/anime/titles/space-patrol-luluco.md"));

  expect(luluco).toMatchObject({ kind: "series", format: "tv-short", releaseYear: 2016, visibility: "published" });
  expect(luluco.poster?.src.startsWith("/media/anime/space-patrol-luluco/")).toBe(true);
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
