import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);

test("Code Sphere retains its cover and Artificial Nature is removed", async () => {
  const [detail, card, codeSphere] = await Promise.all([
    Bun.file(new URL("src/pages/spheres/[slug].astro", root)).text(),
    Bun.file(new URL("src/components/SphereCard.astro", root)).text(),
    Bun.file(new URL("src/content/spheres/independent-systems.md", root)).text(),
  ]);

  expect(detail).toContain("BaseLayout");
  expect(detail).toContain("getStaticPaths");
  expect(card).toContain("sphere.data.cover");
  expect(codeSphere).toContain("Code Sphere");
  expect(codeSphere).toContain("/media/spheres/code-sphere.webp");
  expect(await Bun.file(new URL("src/content/spheres/artificial-nature.md", root)).exists()).toBe(false);
});
