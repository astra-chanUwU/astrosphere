import { expect, test } from "bun:test";

const component = await Bun.file(new URL("../src/components/MediaFrame.astro", import.meta.url)).text();

test("each rendered image provides a safe full-size link", () => {
  expect(component).toContain('media.kind === "image" && <a class="full-size-link"');
  expect(component).toContain('href={media.src}');
  expect(component).toContain('target="_blank"');
  expect(component).toContain('rel="noopener noreferrer"');
});
