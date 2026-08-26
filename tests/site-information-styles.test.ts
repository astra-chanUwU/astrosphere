import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const sidebar = await Bun.file(new URL("src/components/SiteSidebar.astro", root)).text();
const support = await Bun.file(new URL("src/pages/support.astro", root)).text();

test("uses a distinct accessible active state for sidebar links", () => {
  expect(sidebar).toContain("a.active");
  expect(sidebar).toContain("border-left");
  expect(sidebar).toContain("aria-current");
});

test("presents support wallets as separate cards", () => {
  expect(support).toContain("wallets");
  expect(support).toContain("border: 1px solid var(--color-border)");
  expect(support).toContain("background: var(--color-surface)");
});
