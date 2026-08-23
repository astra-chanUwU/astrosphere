import { expect, test } from "bun:test";

const content = await Bun.file(new URL("../src/lib/content.ts", import.meta.url)).text();
const types = await Bun.file(new URL("../src/types/content.ts", import.meta.url)).text();

test("exposes published image-set accessors and entry types", () => {
  expect(content).toContain('getCollection("imageSets"');
  expect(content).toContain("getPublishedImageSets");
  expect(content).toContain("getImageSetBySlug");
  expect(types).toContain("imageSetSchema");
});

test("keeps only the approved image sets in the first-class collection", async () => {
  const slugs = [];
  for await (const file of new Bun.Glob("*.md").scan(new URL("../src/content/image-sets", import.meta.url).pathname)) {
    const source = await Bun.file(new URL(file, new URL("../src/content/image-sets/", import.meta.url))).text();
    slugs.push(source.match(/^slug:\s*(.+)$/m)?.[1]?.trim());
  }
  expect(slugs.sort()).toEqual([
    "cafin-maid-tali",
    "cafin-nasus-and-tali",
    "cafin-taliyah-friday",
    "caschlecook",
    "derpixon-fandel-tales-the-cursed-prince",
    "derpixon-fandeltales-the-first-party",
    "derpixon-mystery-bang-scooby-doo",
    "derpixon-test-of-faith",
    "donburik",
    "fantia-ttp-ttptt-2026-06-textless",
    "fez-colored-works-2026",
    "flou-collection-2018-2021",
    "flou-darknessu",
    "flou-sona",
    "flou-stella-oc",
    "ndgd",
    "party-games-stuffy-bunny-bonus-art-and-fanart",
    "pixiv-ttp-77260223",
    "team-dead-deer-once-in-hell",
    "the-cummoner",
    "twistedgrim-animated",
  ]);
});
