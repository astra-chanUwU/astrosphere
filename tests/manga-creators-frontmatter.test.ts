import { expect, test } from "bun:test";

const files = await Array.fromAsync(new Bun.Glob("src/content/manga/series/*.md").scan({ cwd: new URL("../", import.meta.url).pathname }));

test("stores every manga creator as an internal slug without Mangadex URLs", async () => {
  for (const file of files) {
    const source = await Bun.file(new URL(`../${file}`, import.meta.url)).text();
    expect(source).not.toContain("url: https://mangadex.org/author/");
    for (const block of source.matchAll(/(?:authors|artists):\n([\s\S]*?)(?=\n(?:cover|art|featured|---):?)/g)) {
      for (const credit of block[1].split("\n  - ").slice(1)) {
        expect(credit).toMatch(/\n    slug: [a-z0-9-]+/);
      }
    }
  }
});

test("the MangaDex importer requires external media storage before network access", () => {
  const result = Bun.spawnSync([
    "bun",
    "scripts/import-mangadex.ts",
    "https://mangadex.org/title/00000000-0000-0000-0000-000000000000/example",
  ], {
    cwd: new URL("../", import.meta.url).pathname,
    env: { ...process.env, MANGA_MEDIA_ROOT: "", MANGADEX_API_URL: "http://127.0.0.1:1" },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("Set MANGA_MEDIA_ROOT");
  expect(result.stderr.toString()).not.toContain("Cannot reach MangaDex");
});
