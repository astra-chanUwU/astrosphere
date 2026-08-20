import { expect, test } from "bun:test";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(await Bun.file(new URL("package.json", root)).text());
const tsconfig = JSON.parse(await Bun.file(new URL("tsconfig.json", root)).text());
const searchRoute = Bun.file(new URL("src/pages/search.astro", root));
const searchController = Bun.file(new URL("src/scripts/pagefind-search.ts", root));

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
