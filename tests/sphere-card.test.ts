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

  expect(component).toMatch(/height:\s*clamp\(5rem,\s*12vw,\s*7rem\)/);
  expect(component).toMatch(/object-fit:\s*cover/);
});
