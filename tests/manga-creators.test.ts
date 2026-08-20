import { expect, test } from "bun:test";
import { getMangaCreators } from "../src/lib/manga-creators";

const series = [
  {
    data: {
      slug: "series-a",
      title: "Series A",
      visibility: "published",
      authors: [{ name: "Hirano Kouta", slug: "hirano-kouta" }],
      artists: [{ name: "Hirano Kouta", slug: "hirano-kouta" }],
    },
  },
  {
    data: {
      slug: "series-b",
      title: "Series B",
      visibility: "published",
      authors: [{ name: "Hirano Kouta", slug: "hirano-kouta" }],
      artists: [{ name: "Other Artist", slug: "other-artist" }],
    },
  },
] as never;

test("groups creator credits and combines author and artist roles", () => {
  expect(getMangaCreators(series)).toEqual([
    {
      slug: "hirano-kouta",
      name: "Hirano Kouta",
      series: [
        { slug: "series-a", title: "Series A", roles: ["author", "artist"] },
        { slug: "series-b", title: "Series B", roles: ["author"] },
      ],
    },
    {
      slug: "other-artist",
      name: "Other Artist",
      series: [{ slug: "series-b", title: "Series B", roles: ["artist"] }],
    },
  ]);
});
