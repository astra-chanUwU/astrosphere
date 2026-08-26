type AnimeTitleLike = {
  collection: "animeTitles";
  data: {
    slug: string;
    kind: "series" | "movie";
    visibility: string;
  };
};

type AnimeVideoLike = {
  collection: "animeVideos";
  data: {
    slug: string;
    anime: string;
    kind: "episode" | "movie" | "extra";
    number?: number;
    status: string;
  };
};

export type AnimeReferenceIssue = {
  code:
    | "missing-title"
    | "duplicate-episode-number"
    | "duplicate-movie"
    | "kind-mismatch"
    | "unpublished-title";
  source: string;
  field: string;
  target: string;
  message: string;
};

export const sortAnimeVideos = <T extends AnimeVideoLike>(videos: T[]): T[] =>
  [...videos].sort((left, right) => {
    const leftRank = left.data.kind === "episode" ? 0 : left.data.kind === "movie" ? 1 : 2;
    const rightRank = right.data.kind === "episode" ? 0 : right.data.kind === "movie" ? 1 : 2;
    return (
      leftRank - rightRank ||
      (left.data.number ?? Number.MAX_SAFE_INTEGER) - (right.data.number ?? Number.MAX_SAFE_INTEGER) ||
      left.data.slug.localeCompare(right.data.slug)
    );
  });

export const validateAnimeReferences = <
  TTitle extends AnimeTitleLike,
  TVideo extends AnimeVideoLike,
>({
  titles,
  videos,
}: {
  titles: TTitle[];
  videos: TVideo[];
}): AnimeReferenceIssue[] => {
  const titlesBySlug = new Map(titles.map((title) => [title.data.slug, title]));
  const episodeNumbers = new Map<string, Set<number>>();
  const movieCounts = new Map<string, number>();
  const issues: AnimeReferenceIssue[] = [];

  for (const video of videos) {
    const source = `animeVideos:${video.data.slug}`;
    const title = titlesBySlug.get(video.data.anime);
    if (!title) {
      issues.push({
        code: "missing-title",
        source,
        field: "anime",
        target: video.data.anime,
        message: `references missing anime title "${video.data.anime}"`,
      });
      continue;
    }
    if (video.data.status === "published" && title.data.visibility !== "published") {
      issues.push({
        code: "unpublished-title",
        source,
        field: "anime",
        target: video.data.anime,
        message: `published video references unpublished anime title "${video.data.anime}"`,
      });
    }
    const expectedKind = title.data.kind === "movie" ? "movie" : undefined;
    if (
      (expectedKind && video.data.kind !== expectedKind) ||
      (!expectedKind && video.data.kind === "movie")
    ) {
      issues.push({
        code: "kind-mismatch",
        source,
        field: "kind",
        target: title.data.slug,
        message: `${video.data.kind} item does not match ${title.data.kind} title`,
      });
    }
    if (video.data.kind === "episode" && video.data.number !== undefined) {
      const used = episodeNumbers.get(video.data.anime) ?? new Set<number>();
      if (used.has(video.data.number)) {
        issues.push({
          code: "duplicate-episode-number",
          source,
          field: "number",
          target: String(video.data.number),
          message: `duplicates episode ${video.data.number} in ${video.data.anime}`,
        });
      }
      used.add(video.data.number);
      episodeNumbers.set(video.data.anime, used);
    }
    if (video.data.kind === "movie") {
      movieCounts.set(video.data.anime, (movieCounts.get(video.data.anime) ?? 0) + 1);
    }
  }

  for (const [anime, count] of movieCounts) {
    if (count <= 1) continue;
    issues.push({
      code: "duplicate-movie",
      source: `animeTitles:${anime}`,
      field: "videos",
      target: anime,
      message: `movie-style title has ${count} published movie items`,
    });
  }
  return issues;
};
