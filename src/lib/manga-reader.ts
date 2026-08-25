export type ChapterOrder = { data: { number: number } };
export type MangaChapterAvailability = {
  availability?: "available" | "unavailable";
  pageCount?: number;
};

const availablePageCount = (chapter: MangaChapterAvailability): number => {
  if (!Number.isInteger(chapter.pageCount) || (chapter.pageCount ?? 0) <= 0) {
    throw new Error("Available manga chapter requires a positive page count.");
  }
  return chapter.pageCount!;
};

export const getMangaChapterAvailabilityLabel = (
  chapter: MangaChapterAvailability,
): string =>
  chapter.availability === "unavailable"
    ? "Currently unavailable"
    : `${availablePageCount(chapter)} pages`;

export const getMangaChapterPages = (
  chapter: MangaChapterAvailability,
): number[] =>
  chapter.availability === "unavailable"
    ? []
    : Array.from({ length: availablePageCount(chapter) }, (_, index) => index + 1);
export type MangaFormat = "manga" | "doujinshi" | "one-shot" | "artbook" | "web-comic";
export type MangaPublicRoute = "manga" | "doujinshi";

export const belongsToMangaPublicRoute = (format: MangaFormat, route: MangaPublicRoute): boolean =>
  (format === "doujinshi" ? "doujinshi" : "manga") === route;

export const getMangaPublicPath = (format: MangaFormat, slug: string, chapter?: string): string => {
  const root = format === "doujinshi" ? "/doujinshi" : "/manga";
  return chapter ? `${root}/${slug}/${chapter}` : `${root}/${slug}`;
};

const normalizeMangaPagePath = (pagePath: string): string => {
  if (!pagePath.startsWith("/manga/")) {
    throw new Error(`Expected a /manga page path, received "${pagePath}".`);
  }

  const pathname = new URL(pagePath, "http://manga.local").pathname;

  if (!pathname.startsWith("/manga/")) {
    throw new Error(`Expected a /manga page path, received "${pagePath}".`);
  }

  return pathname.replace(/\/+$/, "");
};

const paddedPageNumber = (page: number): string => {
  if (!Number.isInteger(page) || page <= 0) {
    throw new Error("Expected a positive page number.");
  }
  return String(page).padStart(3, "0");
};

export const createMangaPageSrc = (pagePath: string, page: number, extension = "jpg") =>
  `${normalizeMangaPagePath(pagePath)}/${paddedPageNumber(page)}.${extension}`;

export const createDoujinshiThumbnailSrc = (pagePath: string, page: number): string =>
  `${normalizeMangaPagePath(pagePath)}/thumbnails/${paddedPageNumber(page)}.webp`;

const normalizeSeriesSlug = (slug: string): string => {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Expected a safe manga series slug, received "${slug}".`);
  }
  return slug;
};

const mangaSeriesMediaBase = (slug: string, source?: string): string => {
  const fallback = `/manga/${normalizeSeriesSlug(slug)}`;
  if (!source?.startsWith("/manga/")) return fallback;
  const pathname = new URL(source, "http://manga.local").pathname;
  const segment = pathname.split("/")[2];
  return segment ? `/manga/${segment}` : fallback;
};

export const createMangaCoverThumbnailSrc = (slug: string, source?: string): string =>
  `${mangaSeriesMediaBase(slug, source)}/thumbnails/cover.webp`;

export const createMangaArtworkThumbnailSrc = (slug: string, index: number, seriesSource?: string): string =>
  `${mangaSeriesMediaBase(slug, seriesSource)}/thumbnails/art/${paddedPageNumber(index)}.webp`;

const supportsGeneratedThumbnails = (format: MangaFormat): boolean =>
  format === "manga" || format === "doujinshi";

export const createMangaCoverPreviewSrc = (format: MangaFormat, slug: string, source: string): string =>
  supportsGeneratedThumbnails(format) ? createMangaCoverThumbnailSrc(slug, source) : source;

export const createMangaArtworkPreviewSrc = (format: MangaFormat, slug: string, index: number, source: string, seriesSource?: string): string =>
  supportsGeneratedThumbnails(format) && (source.startsWith("/manga/") || source.startsWith("/media/images/"))
    ? createMangaArtworkThumbnailSrc(slug, index, seriesSource)
    : source;

export const sortMangaChapters = <T extends ChapterOrder>(chapters: T[]) =>
  [...chapters].sort((left, right) => left.data.number - right.data.number);

export const getMangaInstallmentLabel = (format: MangaFormat, number: number, title?: string) => {
  if (title?.startsWith("Volume ")) return title;
  if (format === "doujinshi") return "Doujinshi";
  if (format === "one-shot") return "One-shot";
  return `Chapter ${number}`;
};
