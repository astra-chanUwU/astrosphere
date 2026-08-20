import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const articlePath = new URL("src/content/artifacts/essays/bloodborne-still-hunts.md", root);
const article = await Bun.file(articlePath).text().catch(() => "");

test("publishes the Bloodborne feature in Games with a legal official emulator reference", () => {
  expect(article).toContain("spheres: [games]");
  expect(article).toContain("https://shadps4.net/");
  expect(article).toContain("legally entitled to use");
});

test("keeps every Bloodborne illustration in the local public archive", async () => {
  const assets = [
    "main-menu-banner.jpeg",
    "arcane-level-up.avif",
    "weapons-sheet.jpeg",
    "bone-ash-reference.jpg",
    "bone-ash-concept.jpg",
    "choir-helm.jpeg",
    "choir-garb.jpeg",
    "cleric-beast-fight.webp",
    "threaded-cane-action.jpg",
    "old-hunters-weapons.jpeg",
    "call-beyond-banner.jpg",
    "darkbeast-fight.jpeg",
  ];

  for (const asset of assets) {
    const image = Bun.file(new URL(`public/media/games/bloodborne/${asset}`, root));
    expect(await image.exists()).toBe(true);
  }
});
