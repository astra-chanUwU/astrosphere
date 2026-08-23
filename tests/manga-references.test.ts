import { expect, test } from "bun:test";
import { validateMangaReferences } from "../src/lib/manga-references";

test("reports a chapter that references a missing manga series", () => {
  const issues = validateMangaReferences({
    mangaSeries: [],
    mangaChapters: [{ collection: "mangaChapters", data: { slug: "missing-series-chapter-001", series: "missing-series" } }],
  });

  expect(issues).toEqual([{ source: "mangaChapters:missing-series-chapter-001", field: "series", target: "missing-series", expectedCollection: "mangaSeries" }]);
});
