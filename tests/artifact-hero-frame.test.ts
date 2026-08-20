import { expect, test } from "bun:test";

const page = await Bun.file(new URL("../src/pages/artifacts/[slug].astro", import.meta.url)).text();

test("artifact heroes retain their natural width inside a viewport-aware bound", () => {
  expect(page).toContain('class="hero-frame"');
  expect(page).toMatch(/width:\s*fit-content/);
  expect(page).toMatch(/max-height:\s*clamp\(16rem,\s*42svh,\s*30rem\)/);
  expect(page).toMatch(/object-fit:\s*contain/);
});
