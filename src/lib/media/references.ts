import { isManagedMediaUrl } from "./paths";
import {
  isPublishedMediaEntry,
  type MediaContentEntry,
} from "./content-source";
import { createDoujinshiThumbnailSrc, createMangaArtworkThumbnailSrc, createMangaCoverThumbnailSrc } from "../manga-reader";
import { createImageSetThumbnailSrc } from "../image-set-gallery";
import {
  collectDenseGalleryImageSources,
  createManagedImageThumbnailSrc,
} from "../managed-image-thumbnails";

export type MediaReference = {
  source: string;
  field: string;
  publicPath: string;
};

const collectFrontmatterReferences = (
  value: unknown,
  source: string,
  field: string,
  references: MediaReference[],
): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectFrontmatterReferences(
        item,
        source,
        `${field}[${index}]`,
        references,
      ),
    );
    return;
  }
  if (!value || typeof value !== "object") return;

  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object).sort()) {
    const nestedField = field ? `${field}.${key}` : key;
    const nestedValue = object[key];
    if (
      (key === "src" || key === "poster") &&
      typeof nestedValue === "string" &&
      isManagedMediaUrl(nestedValue)
    ) {
      references.push({ source, field: nestedField, publicPath: nestedValue });
      continue;
    }
    collectFrontmatterReferences(nestedValue, source, nestedField, references);
  }
};

const collectBodyMatches = (
  body: string,
  source: string,
  expression: RegExp,
  fieldPrefix: string,
): MediaReference[] => {
  const references: MediaReference[] = [];
  for (const match of body.matchAll(expression)) {
    const publicPath = match[1];
    if (!publicPath || !isManagedMediaUrl(publicPath)) continue;
    references.push({
      source,
      field: fieldPrefix,
      publicPath,
    });
  }
  return references.sort(
    (left, right) =>
      left.publicPath.localeCompare(right.publicPath) ||
      left.field.localeCompare(right.field),
  );
};

const collectReaderReferences = (
  entry: MediaContentEntry,
  seriesFormats: Map<string, string>,
): MediaReference[] => {
  if (entry.collection !== "mangaChapters") return [];
  const { pagePath, pageExtension, pageCount } = entry.data;
  const hasReaderMetadata =
    pagePath !== undefined ||
    pageExtension !== undefined ||
    pageCount !== undefined;
  if (!hasReaderMetadata) return [];

  const extension =
    typeof pageExtension === "string" ? pageExtension.toLowerCase() : "";
  if (
    typeof pagePath !== "string" ||
    !pagePath.startsWith("/manga/") ||
    !Number.isInteger(pageCount) ||
    (pageCount as number) <= 0 ||
    !["jpg", "jpeg", "png", "webp"].includes(extension)
  ) {
    throw new Error(`Invalid reader media metadata in ${entry.path}`);
  }

  const base = pagePath.replace(/\/+$/, "");
  const pages = Array.from({ length: pageCount as number }, (_, index) => ({
    source: entry.path,
    field: `pages[${index + 1}]`,
    publicPath: `${base}/${String(index + 1).padStart(3, "0")}.${extension}`,
  }));
  const series = typeof entry.data.series === "string" ? entry.data.series : undefined;
  if (!series || !["manga", "doujinshi"].includes(seriesFormats.get(series) ?? "")) return pages;
  return [
    ...pages,
    ...Array.from({ length: pageCount as number }, (_, index) => ({
      source: entry.path,
      field: `thumbnails[${index + 1}]`,
      publicPath: createDoujinshiThumbnailSrc(base, index + 1),
    })),
  ];
};

const collectSeriesThumbnailReferences = (entry: MediaContentEntry): MediaReference[] => {
  if (entry.collection !== "mangaSeries" || !["manga", "doujinshi"].includes(String(entry.data.format))) return [];
  const slug = typeof entry.data.slug === "string" ? entry.data.slug : undefined;
  if (!slug) return [];
  const references: MediaReference[] = [];
  const cover = entry.data.cover as { src?: unknown } | undefined;
  if (typeof cover?.src === "string") {
    references.push({ source: entry.path, field: "thumbnail.cover", publicPath: createMangaCoverThumbnailSrc(slug, cover.src) });
  }
  const art = Array.isArray(entry.data.art) ? entry.data.art : [];
  art.forEach((piece, index) => {
    const source = (piece as { src?: unknown })?.src;
    if (typeof source !== "string" || !isManagedMediaUrl(source)) return;
    references.push({
      source: entry.path,
      field: `thumbnail.art[${index + 1}]`,
      publicPath: createMangaArtworkThumbnailSrc(slug, index + 1, typeof cover?.src === "string" ? cover.src : undefined),
    });
  });
  return references;
};

const collectImageSetThumbnailReferences = (entry: MediaContentEntry): MediaReference[] => {
  if (entry.collection !== "imageSets" || typeof entry.data.slug !== "string") return [];
  const items = [
    { value: entry.data.hero, field: "thumbnail.hero" },
    ...(Array.isArray(entry.data.media)
      ? entry.data.media.map((value, index) => ({ value, field: `thumbnail.media[${index + 1}]` }))
      : []),
  ];
  const references: MediaReference[] = [];
  for (const { value, field } of items) {
    const media = value as { kind?: unknown; src?: unknown } | undefined;
    if (media?.kind !== "image" || typeof media.src !== "string" || !isManagedMediaUrl(media.src)) continue;
    const publicPath = createImageSetThumbnailSrc(entry.data.slug, media.src);
    if (publicPath !== media.src) references.push({ source: entry.path, field, publicPath });
  }
  return references;
};

const collectEditorialThumbnailReferences = (entry: MediaContentEntry): MediaReference[] => {
  const references: MediaReference[] = [];
  const add = (source: unknown, field: string): void => {
    if (typeof source !== "string" || !isManagedMediaUrl(source) || !source.startsWith("/media/images/")) return;
    const publicPath = createManagedImageThumbnailSrc(source);
    if (publicPath !== source) references.push({ source: entry.path, field, publicPath });
  };

  if (entry.collection === "artifacts") {
    const hero = entry.data.hero as { kind?: unknown; src?: unknown } | undefined;
    if (hero?.kind === "image") add(hero.src, "thumbnail.hero");
    const media = Array.isArray(entry.data.media) ? entry.data.media : [];
    media.forEach((value, index) => {
      const item = value as { kind?: unknown; src?: unknown } | undefined;
      if (item?.kind === "image") add(item.src, `thumbnail.media[${index + 1}]`);
    });
    collectDenseGalleryImageSources(entry.body).forEach((source, index) => {
      add(source, `thumbnail.body[${index + 1}]`);
    });
  }

  if (entry.collection === "spheres") {
    const cover = entry.data.cover as { kind?: unknown; src?: unknown } | undefined;
    if (cover?.kind === "image") add(cover.src, "thumbnail.cover");
  }
  return references;
};

export const collectManagedMediaReferences = (
  entries: MediaContentEntry[],
): MediaReference[] => {
  const collected: MediaReference[] = [];
  const seriesFormats = new Map<string, string>();
  for (const entry of entries) {
    if (
      entry.collection === "mangaSeries" &&
      typeof entry.data.slug === "string" &&
      typeof entry.data.format === "string"
    ) {
      seriesFormats.set(entry.data.slug, entry.data.format);
    }
  }
  for (const entry of entries) {
    if (!isPublishedMediaEntry(entry)) continue;

    const frontmatter: MediaReference[] = [];
    collectFrontmatterReferences(entry.data, entry.path, "", frontmatter);
    frontmatter.sort(
      (left, right) =>
        left.field.localeCompare(right.field) ||
        left.publicPath.localeCompare(right.publicPath),
    );
    collected.push(...frontmatter);
    collected.push(...collectSeriesThumbnailReferences(entry));
    collected.push(...collectImageSetThumbnailReferences(entry));
    collected.push(...collectEditorialThumbnailReferences(entry));
    collected.push(
      ...collectBodyMatches(
        entry.body,
        entry.path,
        /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/g,
        "body.markdown",
      ),
    );
    collected.push(
      ...collectBodyMatches(
        entry.body,
        entry.path,
        /<[^>]+\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
        "body.html",
      ),
    );
    collected.push(...collectReaderReferences(entry, seriesFormats));
  }

  const seen = new Set<string>();
  return collected.filter((reference) => {
    const key = `${reference.source}\0${reference.field}\0${reference.publicPath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
