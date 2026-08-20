import { expect, test } from "bun:test";

const mediaFrame = await Bun.file(new URL("../src/components/MediaFrame.astro", import.meta.url)).text();
const gallery = await Bun.file(new URL("../src/components/MediaGallery.astro", import.meta.url)).text();
const page = await Bun.file(new URL("../src/pages/artifacts/[slug].astro", import.meta.url)).text();
const globalStyles = await Bun.file(new URL("../src/styles/global.css", import.meta.url)).text();

test("uses separate uncropped sizing rules for hero, gallery, and prose images", () => {
  expect(mediaFrame).toContain('class="media-image"');
  expect(gallery).toMatch(/aspect-ratio:\s*4\s*\/\s*3/);
  expect(gallery).toMatch(/object-fit:\s*contain/);
  expect(page).toMatch(/height:\s*clamp\(16rem,\s*42svh,\s*30rem\)/);
  expect(globalStyles).toMatch(/\.prose img\s*\{[^}]*max-inline-size:\s*min\(100%,\s*42rem\)/s);
});
