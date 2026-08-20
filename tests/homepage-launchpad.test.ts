import { expect, test } from "bun:test";

const homepage = await Bun.file(new URL("../src/pages/index.astro", import.meta.url)).text();

test("uses a personal archive index instead of a recent-posts launchpad", () => {
  expect(homepage).toContain("getPublishedTrails");
  expect(homepage).toContain('class="entry-points"');
  expect(homepage).toContain("Visual notes from the archive");
  expect(homepage).toContain("Manga kept close");
  expect(homepage).toContain("Two ways through");
  expect(homepage).toContain("Places to return to");
  expect(homepage).toContain("Ways of entering");
});
