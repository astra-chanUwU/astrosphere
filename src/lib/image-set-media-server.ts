import { extname } from "node:path";
import { resolveImageSetMediaFile } from "./image-set-media-root";

export const resolveImageSetMediaRequestPath = (pathname: string, root: string) => {
  if (!pathname.startsWith("/media/images/")) return undefined;
  return resolveImageSetMediaFile(decodeURIComponent(pathname), root);
};

export const contentTypeForImageSetFile = (pathname: string) => {
  switch (extname(pathname).toLowerCase()) {
    case ".avif": return "image/avif";
    case ".jpeg":
    case ".jpg": return "image/jpeg";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    default: return "application/octet-stream";
  }
};
