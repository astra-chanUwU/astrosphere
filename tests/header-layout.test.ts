import { expect, test } from "bun:test";

const header = await Bun.file(new URL("../src/components/SiteHeader.astro", import.meta.url)).text();

test("uses one compact horizontal inset for the logo and navigation", () => {
  expect(header).toContain("--header-gutter:.65rem");
  expect(header).toContain("padding:var(--space-2) var(--header-gutter)");
  expect(header).toContain("padding:.3rem var(--header-gutter)");
});

test("keeps the brand strip distinct from the page background in both themes", async () => {
  const tokens = await Bun.file(new URL("../src/styles/tokens.css", import.meta.url)).text();

  expect(tokens).toContain("--color-bg: #ffffff; --color-surface: #f4f4f4; --color-header-surface: #e9e9e9;");
  expect(tokens).toContain("--color-bg: #000000; --color-surface: #1b1b1b; --color-header-surface: #1b1b1b;");
  expect(header).toContain(".brand-row{align-items:center;background:var(--color-header-surface);");
});

test("uses shared major destinations instead of archive collection links", () => {
  expect(header).toContain("primaryNavigation");
  expect(header).toContain("{primaryNavigation.map((link)");
  expect(header).not.toContain('label: "Artifacts"');
  expect(header).not.toContain('label: "Signals"');
});

test("separates search and external watchlist utilities from primary navigation", () => {
  expect(header).toContain("utilityNavigation");
  expect(header).toContain("utilityNavigation.map");
  expect(header).toContain('class="search-icon"');
  expect(header).toContain('class="external-indicator"');
});

test("shows the current freelance availability as a linked status signal", () => {
  expect(header).toContain('href="/work"');
  expect(header).toContain("Available for work");
  expect(header).toContain('aria-label="Available for freelance work"');
  expect(header).toContain("status-dot");
  expect(header).toContain('aria-current={pathname === "/work" ? "page" : undefined}');
});

test("keeps work utilities pushed to the right of the archive links", () => {
  expect(header).toContain(".primary-navigation{flex:1}");
  expect(header).toContain(".utility-navigation{border-left");
  expect(header).toContain(".appearance-controls{margin-left:auto}");
});

test("gives preference controls stable labels and visible state hooks", () => {
  expect(header).toContain('data-control-value="dark"');
  expect(header).toContain('data-control-value="crt: off"');
  expect(header).toContain('data-control-value="sfw: on"');
  expect(header).toContain('class="control-glyph"');
  expect(header).toContain('classList.toggle("is-active"');
});

test("keeps contact and support visible as primary destinations", async () => {
  const navigation = await Bun.file(
    new URL("../src/config/navigation.ts", import.meta.url),
  ).text();
  const personalNavigation = navigation.split("export const personalNavigation")[1]?.split("export const utilityNavigation")[0] ?? "";
  expect(personalNavigation).toContain('{ href: "/contact", label: "Contact" }');
  expect(personalNavigation).toContain('{ href: "/support", label: "Support" }');
});

test("separates personal pages from archive and utility navigation", async () => {
  const navigation = await Bun.file(
    new URL("../src/config/navigation.ts", import.meta.url),
  ).text();
  expect(navigation).toContain("personalNavigation");
  expect(navigation).toContain('{ href: "/about", label: "About" }');
  expect(navigation).toContain('{ href: "/contact", label: "Contact" }');
  expect(navigation).toContain('{ href: "/support", label: "Support" }');
});

test("links the anime library from primary navigation", async () => {
  const navigation = await Bun.file(
    new URL("../src/config/navigation.ts", import.meta.url),
  ).text();
  expect(navigation).toContain('{ href: "/anime", label: "Anime" }');
});

test("uses visible thumb-first grids on phones", () => {
  expect(header).toContain("mobile-navigation");
  expect(header).toContain("display:flex;flex-wrap:wrap");
  expect(header).not.toContain("overflow-x:auto");
});

test("keeps archive links together on compact desktop widths", () => {
  expect(header).toContain("@media (max-width:72rem) and (min-width:48.01rem)");
  expect(header).toContain(".primary-navigation{border-bottom");
  expect(header).toContain("flex-basis:100%;");
});
