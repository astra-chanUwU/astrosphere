const MANGA_PREFIX = "/manga";

const normalizeBaseUrl = (baseUrl: string) => {
  const normalized = baseUrl.trim().replace(/\/+$/, "");

  if (
    !normalized
    || (
      normalized !== MANGA_PREFIX
      && !normalized.startsWith("https://")
      && !normalized.startsWith("http://localhost:")
    )
  ) {
    throw new Error("Manga asset base URL must be /manga, HTTPS, or localhost HTTP.");
  }

  return normalized;
};

export const resolveMangaAssetUrl = (source: string, baseUrl = MANGA_PREFIX) => {
  if (source.startsWith("https://")) return source;

  if (source !== MANGA_PREFIX && !source.startsWith(`${MANGA_PREFIX}/`)) {
    throw new Error(`Expected a /manga asset path, received "${source}".`);
  }

  return `${normalizeBaseUrl(baseUrl)}${source.slice(MANGA_PREFIX.length)}`;
};
