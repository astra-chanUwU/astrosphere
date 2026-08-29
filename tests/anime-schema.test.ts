import { expect, test } from "bun:test";
import { animeTitleSchema, animeVideoSchema } from "../src/lib/anime-schema";

const title = {
  slug: "space-patrol-luluco",
  title: "Space Patrol Luluco",
  originalTitle: "Uchuu Patrol Luluco",
  aliases: [],
  visibility: "published",
  status: "completed",
  kind: "series",
  format: "tv-short",
  releaseYear: 2016,
  description: "A middle-schooler becomes a member of the Space Patrol.",
  rating: "safe",
  contentWarnings: [],
  tags: ["science-fiction"],
  studios: ["TRIGGER"],
  directors: ["Hiroyuki Imaishi"],
  featured: false,
  sources: [{ label: "Official site", url: "https://luluco.tv/" }],
};

const episode = {
  slug: "space-patrol-luluco-01",
  anime: "space-patrol-luluco",
  kind: "episode",
  number: 1,
  title: "I'm a Normal Middle School Student",
  durationSeconds: 472.014,
  status: "published",
  defaultVariant: "japanese-subbed",
  variants: [
    {
      slug: "japanese-subbed",
      label: "Japanese with English subtitles",
      language: "Japanese",
      subtitles: "English",
      src: "/media/anime/space-patrol-luluco/videos/01/japanese-subbed.webm",
      width: 1920,
      height: 1080,
    },
  ],
};

test("accepts complete anime title and WebM episode metadata", () => {
  expect(animeTitleSchema.safeParse(title).success).toBe(true);
  expect(animeVideoSchema.safeParse(episode).success).toBe(true);
});

test("requires episode numbering and a real unique default variant", () => {
  expect(animeVideoSchema.safeParse({ ...episode, number: undefined }).success).toBe(false);
  expect(animeVideoSchema.safeParse({ ...episode, defaultVariant: "english-dub" }).success).toBe(false);
  expect(animeVideoSchema.safeParse({ ...episode, variants: [episode.variants[0], episode.variants[0]] }).success).toBe(false);
});

test("rejects non-WebM and cross-title video sources", () => {
  const variant = episode.variants[0];
  expect(animeVideoSchema.safeParse({
    ...episode,
    variants: [{ ...variant, src: variant.src.replace(".webm", ".mp4") }],
  }).success).toBe(false);
  expect(animeVideoSchema.safeParse({
    ...episode,
    variants: [{ ...variant, src: "/media/anime/another-title/videos/01/japanese.webm" }],
  }).success).toBe(false);
});

test("keeps movie-style compilations distinct from numbered episodes", () => {
  expect(animeTitleSchema.safeParse({ ...title, slug: "test-movie", kind: "movie", format: "ova-compilation" }).success).toBe(true);
  expect(animeVideoSchema.safeParse({
    ...episode,
    slug: "test-movie-compilation",
    anime: "test-movie",
    kind: "movie",
    number: undefined,
    variants: [{
      ...episode.variants[0],
      src: "/media/anime/test-movie/videos/compilation/japanese-subbed.webm",
    }],
  }).success).toBe(true);
});
