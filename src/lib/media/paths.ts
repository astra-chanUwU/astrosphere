import { extname, isAbsolute, relative, resolve, win32 } from "node:path";
import { getMediaLayout } from "./config";
import { MediaError } from "./errors";
import type { MediaLayout } from "./types";

export type MediaNamespace = "manga" | "images";
export type ResolvedMediaPath = {
  namespace: MediaNamespace;
  publicPath: string;
  filePath: string;
};

const routes = [
  { prefix: "/manga/", namespace: "manga" as const },
  { prefix: "/media/images/", namespace: "images" as const },
];

const relationEscapesRoot = (value: string): boolean =>
  value === ".." ||
  value.startsWith("../") ||
  value.startsWith("..\\") ||
  isAbsolute(value) ||
  win32.isAbsolute(value);

const windowsRelation = (root: string, remainder: string): string => {
  const windowsRoot = win32.resolve(root);
  const windowsCandidate = win32.resolve(root, remainder);
  return win32.relative(windowsRoot, windowsCandidate);
};

const relationToCandidate = (root: string, candidate: string): string =>
  win32.relative(win32.resolve(root), win32.resolve(candidate));

const relationIsInside = (root: string, candidate: string): boolean => {
  const nativeRelation = relative(root, candidate);
  const crossPlatformRelation = relationToCandidate(root, candidate);
  return !relationEscapesRoot(nativeRelation) && !relationEscapesRoot(crossPlatformRelation);
};

export const isManagedMediaUrl = (source: string): boolean =>
  routes.some(({ prefix }) => source.startsWith(prefix));

export const resolveMediaUrl = (source: string, root: string): ResolvedMediaPath => {
  const route = routes.find(({ prefix }) => source.startsWith(prefix));
  if (!route) {
    throw new MediaError("validation", `Expected a managed media URL, received "${source}".`);
  }

  const layout: MediaLayout = getMediaLayout(root);
  const namespaceRoot = layout[route.namespace];
  const remainder = source.slice(route.prefix.length);
  const filePath = resolve(namespaceRoot, remainder);
  const nativeRelation = relative(namespaceRoot, filePath);
  const crossPlatformRelation = windowsRelation(namespaceRoot, remainder);

  if (relationIsInside(layout.operations, filePath)) {
    throw new MediaError("validation", `Media path "${source}" escapes MEDIA_ROOT (private operations).`);
  }

  if (relationEscapesRoot(nativeRelation) || relationEscapesRoot(crossPlatformRelation)) {
    throw new MediaError("validation", `Media path "${source}" escapes MEDIA_ROOT.`);
  }

  return { namespace: route.namespace, publicPath: source, filePath };
};

export const resolveMediaRequestPath = (
  pathname: string,
  root: string,
): ResolvedMediaPath | undefined => {
  const decoded = decodeURIComponent(pathname);
  return isManagedMediaUrl(decoded) ? resolveMediaUrl(decoded, root) : undefined;
};

export const contentTypeForMediaFile = (pathname: string): string => {
  switch (extname(pathname).toLowerCase()) {
    case ".avif":
      return "image/avif";
    case ".gif":
      return "image/gif";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
};
