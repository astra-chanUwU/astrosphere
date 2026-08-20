import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const supportConfig = await Bun.file(new URL("src/config/support.ts", root)).text().catch(() => "");
const supportRoute = await Bun.file(new URL("src/pages/support.astro", root)).text().catch(() => "");
const footer = await Bun.file(new URL("src/components/SiteFooter.astro", root)).text().catch(() => "");

test("keeps public support details in one guarded configuration file", () => {
  expect(supportConfig).toContain("isConfiguredSupportValue");
  expect(supportConfig).toContain("REPLACE_WITH_");
  expect(supportRoute).toContain("supportConfig");
  expect(supportRoute).toContain("isConfiguredSupportValue");
  expect(supportRoute).toContain("import.meta.env.DEV");
  expect(supportConfig).toContain("exampleSupporters");
});

test("keeps the footer to global utilities and configured socials", () => {
  expect(footer).toContain('href="/rss.xml"');
  expect(footer).toContain('href="/contact"');
  expect(footer).toContain('href="/support"');
  expect(footer).toContain("socials.map");
  expect(footer).not.toContain('href="/trails"');
  expect(footer).not.toContain('href="/now"');
  expect(footer).not.toContain('href="/about"');
  expect(footer).not.toContain('href="/colophon"');
  expect(footer).not.toContain("bitcoin");
});

test("gives every configured wallet a resilient copy control", () => {
  expect(supportRoute).toContain("data-copy-wallet");
  expect(supportRoute).toContain("navigator.clipboard.writeText");
  expect(supportRoute).toContain("astro:page-load");
});

test("lists the AstroSphere EFChat space among public socials", () => {
  expect(supportConfig).toContain('label: "EFChat"');
  expect(supportConfig).toContain("https://efchat.net/AstroSphere");
});
