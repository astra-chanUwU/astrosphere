import { expect, test } from "bun:test";

const card = await Bun.file(new URL("../src/components/MangaSeriesCard.astro", import.meta.url)).text();
const meta = await Bun.file(new URL("../src/components/MangaSeriesMeta.astro", import.meta.url)).text();

test("spaces manga card tags horizontally and vertically when they wrap", () => {
  expect(card).toMatch(/\.tags\s*\{[^}]*display:\s*flex;/s);
  expect(card).toMatch(/\.tags\s*\{[^}]*flex-wrap:\s*wrap;/s);
  expect(card).toMatch(/\.tags\s*\{[^}]*gap:\s*\.3rem\s+\.8rem;/s);
});

test("renders internal author and artist links in manga cards", () => {
  expect(card).toContain("series.data.authors.map");
  expect(card).toContain("series.data.artists.map");
  expect(card).toContain('href={`/manga/creators/${person.slug}`}');
});

test("omits publication years from the manga browsing and series metadata UI", () => {
  expect(card).not.toContain("publicationYear");
  expect(meta).not.toContain("publicationYear");
});
