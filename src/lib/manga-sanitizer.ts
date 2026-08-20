const supportedImagePattern = /\.(?:jpe?g|png|webp)$/i;
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const isSupportedMangaImage = (fileName: string) => !fileName.startsWith(".") && supportedImagePattern.test(fileName);

export const sortMangaSourceFiles = (files: string[]) => [...files].sort(naturalCollator.compare);

export const createSanitizedPageName = (page: number) => `${String(page).padStart(3, "0")}.webp`;
