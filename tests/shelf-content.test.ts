import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const shelfConfig = await Bun.file(new URL("src/config/shelf.ts", root)).text().catch(() => "");
const shelfLibrary = await Bun.file(new URL("src/lib/shelf.ts", root)).text().catch(() => "");
const futaMaid = await Bun.file(new URL("src/content/manga/series/futa-maid.md", root)).text();

test("configures a personal Shelf and classifies Futa Maid as doujinshi", () => {
  expect(shelfConfig).toContain("export const SHELF_PAGE_SIZE = 24");
  expect(shelfConfig).toContain('"gushing-over-magical-girls"');
  expect(shelfConfig).toContain('"murcielago"');
  expect(shelfConfig).toContain('"sorry-but-im-not-into-yuri"');
  expect(shelfConfig).toContain('"ghost-in-the-shell"');
  expect(shelfConfig).toContain('"witches-and-cigarettes"');
  expect(shelfConfig).toContain('"yani-neko"');
  expect(shelfConfig).toContain('"adventurers-by-day-secretly-training-by-night"');
  expect(shelfConfig).toContain('"a-hard-debut"');
  expect(shelfConfig).toContain('"futa-maid"');
  expect(shelfConfig).toContain('"frill-no-shita-no-netsu"');
  expect(shelfConfig).toContain('"mav-dachiex"');
  expect(shelfConfig).toContain('"flou-sona"');
  expect(shelfConfig).toContain('"ndgd"');
  expect(shelfConfig).toContain('animeSlugs: ["space-patrol-luluco", "burn-up-w"]');
  expect(futaMaid).toContain("format: doujinshi");
  expect(shelfLibrary).toContain("getShelfSelections");
  expect(shelfLibrary).toContain("getShelfArchiveHref");
  expect(shelfLibrary).toContain("getPublishedAnimeTitles");
  expect(shelfLibrary).toContain("anime:");
});
