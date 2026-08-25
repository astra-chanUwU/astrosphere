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

export const createMangaPageSrc = (pagePath: string, page: number, extension = "jpg") => {
  if (!pagePath.startsWith("/manga/")) {
    throw new Error(`Expected a /manga page path, received "${pagePath}".`);
  }

  const pathname = new URL(pagePath, "http://manga.local").pathname;

  if (!pathname.startsWith("/manga/")) {
    throw new Error(`Expected a /manga page path, received "${pagePath}".`);
  }

  return `${pathname}/${String(page).padStart(3, "0")}.${extension}`;
};

export const sortMangaChapters = <T extends ChapterOrder>(chapters: T[]) =>
  [...chapters].sort((left, right) => left.data.number - right.data.number);

export const getMangaInstallmentLabel = (format: MangaFormat, number: number, title?: string) => {
  if (title?.startsWith("Volume ")) return title;
  if (format === "doujinshi") return "Doujinshi";
  if (format === "one-shot") return "One-shot";
  return `Chapter ${number}`;
};
