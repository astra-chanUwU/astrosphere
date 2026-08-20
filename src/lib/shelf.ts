import { shelfConfig } from "../config/shelf";
import {
  getPublishedImageSets,
  getPublishedMangaSeries,
  type ImageSetEntry,
  type MangaSeriesEntry,
} from "./content";

export type ShelfCategory = "manga" | "doujinshi" | "image-sets";

const selectConfigured = <T extends { data: { slug: string } }>(entries: T[], slugs: readonly string[]) => {
  const entriesBySlug = new Map(entries.map((entry) => [entry.data.slug, entry]));

  return slugs.flatMap((slug) => {
    const entry = entriesBySlug.get(slug);
    return entry ? [entry] : [];
  });
};

export function getShelfArchiveHref(category: ShelfCategory, page: number): string {
  const root = `/shelf/${category}`;
  return page === 1 ? root : `${root}/page/${page}`;
}

export async function getShelfArchive(category: "manga" | "doujinshi"): Promise<MangaSeriesEntry[]>;
export async function getShelfArchive(category: "image-sets"): Promise<ImageSetEntry[]>;
export async function getShelfArchive(category: ShelfCategory): Promise<MangaSeriesEntry[] | ImageSetEntry[]> {
  if (category === "image-sets") return getPublishedImageSets();

  const series = await getPublishedMangaSeries();
  return series.filter((entry) =>
    category === "doujinshi" ? entry.data.format === "doujinshi" : entry.data.format !== "doujinshi",
  );
}

export async function getShelfSelections(): Promise<{
  manga: MangaSeriesEntry[];
  doujinshi: MangaSeriesEntry[];
  imageSets: ImageSetEntry[];
}> {
  const [manga, doujinshi, imageSets] = await Promise.all([
    getShelfArchive("manga"),
    getShelfArchive("doujinshi"),
    getShelfArchive("image-sets"),
  ]);

  return {
    manga: selectConfigured(manga, shelfConfig.mangaSlugs),
    doujinshi: selectConfigured(doujinshi, shelfConfig.doujinshiSlugs),
    imageSets: selectConfigured(imageSets, shelfConfig.imageSetSlugs),
  };
}
