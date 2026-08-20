import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const article = await Bun.file(new URL("src/content/artifacts/notes/go-ghost-king-gnu.md", root)).text().catch(() => "");

test("publishes GO GHOST as an Anime note with local test audio", () => {
  expect(article).toContain("spheres: [anime]");
  expect(article).toContain("/media/anime/go-ghost/go-ghost.mp3");
  expect(article).toContain("https://youtu.be/PmkN1iH4Ci4");
});

test("keeps GO GHOST media in the local archive", async () => {
  for (const asset of ["go-ghost.mp3", "go-ghost-banner.webp", "go-ghost-cover.webp"]) {
    expect(await Bun.file(new URL(`public/media/anime/go-ghost/${asset}`, root)).exists()).toBe(true);
  }
});
