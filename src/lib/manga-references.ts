export type MangaReferenceIssue = {
  source: string;
  field: "series";
  target: string;
  expectedCollection: "mangaSeries";
};

type MangaSeriesReference = { collection: "mangaSeries"; data: { slug: string } };
type MangaChapterReference = {
  collection: "mangaChapters";
  data: { slug: string; series: string; pagePath: string; pageCount: number };
};

export const validateMangaReferences = ({
  mangaSeries,
  mangaChapters,
}: {
  mangaSeries: MangaSeriesReference[];
  mangaChapters: MangaChapterReference[];
}): MangaReferenceIssue[] => {
  const seriesSlugs = new Set(mangaSeries.map((series) => series.data.slug));

  return mangaChapters.flatMap((chapter) => seriesSlugs.has(chapter.data.series)
    ? []
    : [{
        source: `${chapter.collection}:${chapter.data.slug}`,
        field: "series" as const,
        target: chapter.data.series,
        expectedCollection: "mangaSeries" as const,
      }]);
};
