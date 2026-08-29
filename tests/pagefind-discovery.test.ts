import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await Bun.file(new URL("package.json", root)).text());
const tsconfig = JSON.parse(await Bun.file(new URL("tsconfig.json", root)).text());
const searchRoute = Bun.file(new URL("src/pages/search.astro", root));
const searchController = Bun.file(new URL("src/scripts/pagefind-search.ts", root));
const imageSetPageRoute = Bun.file(new URL("src/pages/image-sets/[slug]/page/[page].astro", root));

test("builds a static Pagefind index after Astro output", () => {
  expect(packageJson.devDependencies.pagefind).toBeDefined();
  expect(packageJson.scripts.build).toContain("pagefind --site dist");
});

test("prepares the Pagefind bundle before Astro's dev server starts", () => {
  expect(packageJson.scripts["prepare:search"]).toContain("pagefind --site dist --output-path public/pagefind");
  expect(packageJson.scripts.dev).toContain("prepare:search");
  expect(tsconfig.exclude).toContain("public/pagefind");
});

test("publishes a dedicated search route", async () => {
  expect(await searchRoute.exists()).toBe(true);
});

test("loads Pagefind directly in the browser instead of through Vite", async () => {
  const route = await searchRoute.text();
  const controller = await searchController.text();
  expect(route).toContain('<script is:inline type="module">');
  expect(route).toContain('await import("/pagefind/pagefind.js")');
  expect(controller).not.toContain('import(/* @vite-ignore */ pagefindModule)');
});

test("keeps the search route connected to the archive index", async () => {
  const route = await searchRoute.text();
  expect(route).toContain('data-search-console');
  expect(route).toContain('data-search-results');
});

test("renders result metadata for archive cards", async () => {
  const controller = await searchController.text();
  expect(controller).toContain('setAttribute("data-result-kind"');
  expect(controller).toContain('result.meta.kind');
  expect(controller).toContain('result.meta.title');
});

test("starts with a search-first empty state", async () => {
  const route = await searchRoute.text();
  const controller = await searchController.text();
  expect(route).toContain('data-search-suggestions');
  expect(route).toContain('data-query={query}');
  expect(route).not.toContain('aria-label="Browse collections"');
  expect(controller).toContain('Type a search to explore the archive.');
  expect(controller).toContain('data-query');
});

test("turns sphere and tag filters into useful discovery controls", async () => {
  const route = await searchRoute.text();
  const controller = await searchController.text();
  expect(route).toContain('data-sphere-options');
  expect(route).toContain('data-tag-search');
  expect(route).toContain('data-selected-tags');
  expect(route).toContain('data-clear-filters');
  expect(route).not.toContain('<select data-sphere-filter>');
  expect(route).not.toContain('<select data-tag-filter>');
  expect(controller).toContain('selectedTags');
  expect(route).toContain('Most used tags');
  expect(route).toContain('Clear all filters');
  expect(controller).toContain('selectedTags');
});

test("indexes an image set once instead of once per gallery page", async () => {
  const route = await imageSetPageRoute.text();
  expect(route).toContain('indexForSearch={false}');
});
