import { expect, test } from "bun:test";

const layout = await Bun.file(new URL("../src/layouts/BaseLayout.astro", import.meta.url)).text();
const header = await Bun.file(new URL("../src/components/SiteHeader.astro", import.meta.url)).text();

test("uses Astro client routing without transition animation", () => {
  expect(layout).toContain('import { ClientRouter } from "astro:transitions";');
  expect(layout).toContain('<ClientRouter fallback="swap" />');
  expect(layout).toContain('<html lang="en" transition:animate="none">');
});

test("reconnects the theme control after client-side navigation", () => {
  expect(header).toContain('document.addEventListener("astro:page-load", setupThemeToggle);');
});

test("preserves the selected theme on Astro's incoming document", () => {
  expect(layout).toContain('document.addEventListener("astro:before-swap", (event) => {');
  expect(layout).toContain("event.newDocument.documentElement.dataset.theme = document.documentElement.dataset.theme;");
});
