import { expect, test } from "bun:test";

const homepage = await Bun.file(new URL("../src/pages/index.astro", import.meta.url)).text();

test("uses an archive feed instead of explanatory launchpad copy", () => {
  expect(homepage).toContain('class="archive-columns"');
  expect(homepage).toContain("dispatches");
  expect(homepage).not.toContain("A small shelf of worlds.");
  expect(homepage).not.toContain("Take the route that suits your mood.");
  expect(homepage).not.toContain("Places to return to");
  expect(homepage).toContain("recommendations");
});
