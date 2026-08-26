import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const paths = [
  "src/components/AnimeCard.astro",
  "src/components/AnimeMeta.astro",
  "src/components/AnimeEpisodeList.astro",
  "src/components/AnimePlayer.astro",
  "src/components/AnimeWatchPage.astro",
  "src/pages/anime/index.astro",
  "src/pages/anime/[slug]/index.astro",
  "src/pages/anime/[slug]/[video].astro",
  "src/pages/anime/[slug]/[video]/[variant].astro",
];

const sources = await Promise.all(
  paths.map(async (path) => ({
    path,
    source: await Bun.file(new URL(path, root)).text().catch(() => ""),
  })),
);

test("renders one native WebM player with metadata preload and a download fallback", () => {
  const player = sources.find(({ path }) => path.endsWith("AnimePlayer.astro"))!
    .source;
  expect((player.match(/<video\b/g) ?? []).length).toBe(1);
  expect(player).toContain('<video controls preload="metadata"');
  expect(player).toContain('type="video/webm"');
  expect(player).toContain("download");
  expect(player).toContain("variant.src");
  expect(player).toContain("getAnimeWatchPath");
});

test("keeps every anime page and component free of anime-specific client JavaScript", () => {
  for (const { path, source } of sources) {
    expect(source.length, `${path} exists`).toBeGreaterThan(0);
    expect(source, path).not.toContain("<script");
    expect(source, path).not.toContain("client:");
    expect(source, path).not.toMatch(/\bHLS\b|\.m3u8|\bDASH\b|\.mpd/i);
    expect(source, path).not.toMatch(/\bautoplay\b/i);
  }
});

test("uses ordinary anchors for variants and previous/next navigation", () => {
  const player = sources.find(({ path }) => path.endsWith("AnimePlayer.astro"))!
    .source;
  const watch = sources.find(({ path }) => path.endsWith("AnimeWatchPage.astro"))!
    .source;
  expect(player).toContain("video.data.variants.map");
  expect(player).toContain("<a");
  expect(watch).toContain("Previous");
  expect(watch).toContain("Next");
  expect(watch).toContain("<a");
});
