export type ChapterOrder = { data: { number: number } };
export type MangaFormat = "manga" | "doujinshi" | "one-shot" | "artbook" | "web-comic";

export const createMangaPageSrc = (pagePath: string, page: number, extension = "jpg") => {
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
