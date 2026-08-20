import { isAbsolute, relative, resolve, sep } from "node:path";

const MANGA_PREFIX = "/manga/";

export const requireMangaMediaRoot = (value = process.env.MANGA_MEDIA_ROOT) => {
  if (!value?.trim()) {
    throw new Error("Set MANGA_MEDIA_ROOT to the absolute path of the external manga directory.");
  }

  const supplied = value.trim();
  if (!isAbsolute(supplied)) {
    throw new Error("MANGA_MEDIA_ROOT must be an absolute path.");
  }

  return resolve(supplied);
};

export const resolveMangaMediaFile = (source: string, root: string) => {
  if (!source.startsWith(MANGA_PREFIX)) {
    throw new Error(`Expected a /manga asset path, received "${source}".`);
  }

  const normalizedRoot = requireMangaMediaRoot(root);
  const candidate = resolve(normalizedRoot, source.slice(MANGA_PREFIX.length));
  const relativePath = relative(normalizedRoot, candidate);

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Manga asset path "${source}" escapes MANGA_MEDIA_ROOT.`);
  }

  return candidate;
};
