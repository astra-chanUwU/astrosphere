import { expect, test } from "bun:test";

const tokens = await Bun.file(new URL("../src/styles/tokens.css", import.meta.url)).text();
const globalStyles = await Bun.file(new URL("../src/styles/global.css", import.meta.url)).text();
const layout = await Bun.file(new URL("../src/layouts/BaseLayout.astro", import.meta.url)).text();
const header = await Bun.file(new URL("../src/components/SiteHeader.astro", import.meta.url)).text();

test("uses a compact editorial type and spacing scale", () => {
  expect(tokens).toContain("--text-lg: 1rem");
  expect(tokens).toContain("--section-space: clamp(1.75rem, 4vw, 3rem)");
  expect(globalStyles).toContain("padding-inline:var(--space-3)");
  expect(globalStyles).toContain("line-height: var(--leading-reading)");
});

test("shows the current page title beside the logo away from home", () => {
  expect(layout).toContain('const headerTitle = Astro.url.pathname === "/"');
  expect(layout).toContain("<SiteHeader title={headerTitle} />");
  expect(header).toContain("interface Props { title: string; }");
  expect(header).toContain("<p>{title}</p>");
});
