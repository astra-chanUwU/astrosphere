import { expect, test } from "bun:test";

const sidebar = await Bun.file(new URL("../src/components/SiteSidebar.astro", import.meta.url)).text();
const navigation = await Bun.file(new URL("../src/config/navigation.ts", import.meta.url)).text();
const layout = await Bun.file(new URL("../src/layouts/BaseLayout.astro", import.meta.url)).text();
const spherePage = await Bun.file(new URL("../src/pages/spheres/[slug].astro", import.meta.url)).text();
const artifactPage = await Bun.file(new URL("../src/pages/artifacts/[slug].astro", import.meta.url)).text();
const trailPage = await Bun.file(new URL("../src/pages/trails/[slug].astro", import.meta.url)).text();
const mangaPage = await Bun.file(new URL("../src/pages/manga/[slug].astro", import.meta.url)).text();
const readerPage = await Bun.file(new URL("../src/pages/manga/[slug]/[chapter].astro", import.meta.url)).text();
const dock = await Bun.file(new URL("../src/components/ReaderDock.astro", import.meta.url)).text();

test("navigation defines stable global destinations and contextual archive defaults", () => {
  expect(navigation).toContain('label: "Explore"');
  expect(navigation).toContain('{ href: "/manga", label: "Manga" }');
  expect(navigation).toContain('{ href: "/doujinshi", label: "Doujinshi" }');
  expect(navigation).toContain('{ href: "/image-sets", label: "Image sets" }');
  expect(navigation).toContain('label: "Watchlist"');
  expect(navigation).toContain("export const resolveSidebar");
  expect(navigation).toContain('heading: "Explore the archive"');
  expect(navigation).toContain("pathname.startsWith(`${path}/page/`)");
});

test("sidebar renders passed contextual items with a mobile disclosure", () => {
  expect(sidebar).toContain("interface Props { model: SidebarModel; }");
  expect(sidebar).toContain("<details open>");
  expect(sidebar).toContain("window.matchMedia(\"(max-width: 48rem)\")");
  expect(sidebar).toContain('aria-current={item.current ? "page" : undefined}');
  expect(sidebar).toContain("min-height:2.75rem");
  expect(sidebar).not.toContain("overflow-x: auto");
  expect(sidebar).not.toContain('class="intro"');
  expect(navigation).not.toContain("intro:");
});

test("base layout resolves a sidebar for the current route", () => {
  expect(layout).toContain("sidebar?: SidebarModel");
  expect(layout).toContain("resolveSidebar(Astro.url.pathname)");
  expect(layout).toContain("<SiteSidebar model={resolvedSidebar} />");
});

test("layout can opt into the reader dock and sidebar exposes a focus target", () => {
  expect(layout).toContain("readerDock?: boolean");
  expect(layout).toContain("<ReaderDock />");
  expect(layout).toContain("readerDock &&");
  expect(sidebar).toContain("data-reader-navigation");
  expect(sidebar).toContain('tabindex="-1"');
  expect(dock).toContain('data-reader-open-navigation');
});

test("detail routes supply their own archive context", () => {
  expect(spherePage).toContain("sidebar={sidebar}");
  expect(artifactPage).toContain('heading: "Artifact details"');
  expect(trailPage).toContain('heading: "Trail contents"');
  expect(mangaPage).toContain('heading: "Manga library"');
  expect(readerPage).toContain('{ href: "/manga", label: "All manga" }');
  expect(readerPage).toContain("heading: series.data.title");
});
