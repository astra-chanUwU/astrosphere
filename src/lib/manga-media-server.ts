import { extname } from "node:path";
import { resolveMangaMediaFile } from "./manga-media-root";

export const resolveMangaMediaRequestPath = (pathname: string, root: string) => {
  if (!pathname.startsWith("/manga/")) return undefined;
  return resolveMangaMediaFile(decodeURIComponent(pathname), root);
};

export const contentTypeForMangaFile = (pathname: string) => {
  switch (extname(pathname).toLowerCase()) {
    case ".avif": return "image/avif";
    case ".jpeg":
    case ".jpg": return "image/jpeg";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    default: return "application/octet-stream";
  }
};
