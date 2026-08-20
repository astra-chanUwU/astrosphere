import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const article = await Bun.file(new URL("src/content/artifacts/essays/shirow-masamune-artworks-in-the-shell.md", root)).text().catch(() => "");

test("publishes Shirow Masamune Artworks in the Shell from the official announcement", () => {
  expect(article).toContain("Shirow Masamune Artworks in the Shell");
  expect(article).toContain("260+");
  expect(article).toContain("theghostintheshell.jp/en/news/shirow_masamune_artworks");
});

test("uses the blue Motoko banner from the local Shirow art archive", async () => {
  const banner = Bun.file(new URL("public/media/anime/shirow-masamune-artworks/motoko-blue-banner.webp", root));
  expect(await banner.exists()).toBe(true);
});
