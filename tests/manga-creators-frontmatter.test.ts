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
