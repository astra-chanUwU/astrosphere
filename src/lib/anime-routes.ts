export const getAnimePublicPath = (titleSlug: string): string =>
  `/anime/${titleSlug}`;

export const getAnimeWatchPath = (
  titleSlug: string,
  videoSlug: string,
  variantSlug?: string,
  defaultVariant?: string,
): string => {
  const base = `${getAnimePublicPath(titleSlug)}/${videoSlug}`;
  return !variantSlug || variantSlug === defaultVariant
    ? base
    : `${base}/${variantSlug}`;
};
