import { expect, test } from "bun:test";

const dock = await Bun.file(new URL("../src/components/ReaderDock.astro", import.meta.url)).text();
const artifactPage = await Bun.file(new URL("../src/pages/artifacts/[slug].astro", import.meta.url)).text();

test("reader dock exposes progress, scroll shortcuts, and contextual navigation", () => {
  expect(dock).toContain('data-reader-dock');
  expect(dock).toContain('aria-label="Reading controls"');
  expect(dock).toContain('aria-label="Reading progress"');
  expect(dock).toContain('aria-label="Jump to the top"');
  expect(dock).toContain('aria-label="Jump to the end"');
  expect(dock).toContain('aria-label="Open page navigation"');
});

test("reader dock honors reduced motion and initializes after Astro navigation", () => {
  expect(dock).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
  expect(dock).toContain('document.addEventListener("astro:page-load", initializeReaderDock)');
  expect(dock).toContain('requestAnimationFrame(updateProgress)');
});

test("artifact reading pages opt into the dock after their article header", () => {
  expect(artifactPage).toContain("readerDock");
  expect(artifactPage).toContain("data-reader-header");
});
