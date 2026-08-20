import { resolveMangaAssetUrl } from "./manga-assets";

export type ChapterOrder = { data: { number: number } };
export type MangaFormat = "manga" | "doujinshi" | "one-shot" | "artbook" | "web-comic";

export const createMangaPageSrc = (pagePath: string, page: number, extension = "jpg", baseUrl?: string) =>
  resolveMangaAssetUrl(`${pagePath}/${String(page).padStart(3, "0")}.${extension}`, baseUrl);

export const sortMangaChapters = <T extends ChapterOrder>(chapters: T[]) =>
  [...chapters].sort((left, right) => left.data.number - right.data.number);

export const getMangaInstallmentLabel = (format: MangaFormat, number: number, title?: string) => {
  if (title?.startsWith("Volume ")) return title;
  if (format === "doujinshi") return "Doujinshi";
  if (format === "one-shot") return "One-shot";
  return `Chapter ${number}`;
};
