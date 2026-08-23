import { isAbsolute, resolve } from "node:path";
import { MediaError } from "./errors";
import type { MediaLayout } from "./types";

export const requireMediaRoot = (value = Bun.env.MEDIA_ROOT): string => {
  const supplied = value?.trim();
  if (!supplied) throw new MediaError("configuration", "Set MEDIA_ROOT to the absolute path of the external media directory.");
  if (!isAbsolute(supplied)) throw new MediaError("configuration", "MEDIA_ROOT must be an absolute path.");
  return resolve(supplied);
};

export const getMediaLayout = (value = Bun.env.MEDIA_ROOT): MediaLayout => {
  const root = requireMediaRoot(value);
  return { root, manga: resolve(root, "manga"), images: resolve(root, "images"), operations: resolve(root, ".astrosphere") };
};

export const requireMediaPort = (value = Bun.env.MEDIA_PORT): number => {
  const port = value === undefined ? 4322 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new MediaError("configuration", "MEDIA_PORT must be an integer from 1 to 65535.");
  return port;
};

export const requireMediaSyncTarget = (value = Bun.env.MEDIA_SYNC_TARGET): string => {
  const supplied = value?.trim();
  const target = supplied?.match(/^([^@\s]+@[^:\s]+:)(\/[A-Za-z0-9._/-]*)$/);
  if (!target) {
    throw new MediaError("configuration", "MEDIA_SYNC_TARGET must use user@host:/absolute/path format.");
  }
  const [, remote, remotePath] = target;
  return `${remote}${remotePath.replace(/\/+$/, "") || "/"}`;
};
