import { expect, test } from "bun:test";

const workspace = new URL("..", import.meta.url).pathname;

test("sphere cards render an optional cover image", async () => {
  const component = await Bun.file(`${workspace}/src/components/SphereCard.astro`).text();

  expect(component).toContain("sphere.data.cover");
  expect(component).toContain("cover");
  expect(component).toContain("alt");
});

test("sphere covers use a compact responsive row frame", async () => {
  const component = await Bun.file(`${workspace}/src/components/SphereCard.astro`).text();

  expect(component).toContain("aspect-ratio: 1 / 1");
  expect(component).toMatch(/object-fit:\s*cover/);
});

test("sphere rows follow the existing collection card pattern", async () => {
  const component = await Bun.file(`${workspace}/src/components/SphereCard.astro`).text();

  expect(component).toContain("sphere-row--has-cover");
  expect(component).toMatch(/grid-template-columns:\s*7rem\s+minmax\(0,\s*1fr\)/);
  expect(component).toContain('class="details"');
  expect(component).not.toContain("border-left: 3px");
});
