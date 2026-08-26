import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import sharp, { type Metadata } from "sharp";
import {
  createDoujinshiThumbnailSrc,
  createMangaArtworkThumbnailSrc,
  createMangaCoverThumbnailSrc,
  createMangaPageSrc,
} from "../manga-reader";
import { createImageSetThumbnailSrc } from "../image-set-gallery";
import {
  collectDenseGalleryImageSources,
  createManagedImageThumbnailSrc,
} from "../managed-image-thumbnails";
import { isPublishedMediaEntry, type MediaContentEntry } from "./content-source";
import { isManagedMediaUrl, resolveMediaUrl } from "./paths";

export const doujinshiThumbnailWidth = 320;
export const doujinshiThumbnailQuality = 70;

export type DoujinshiThumbnailItem = {
  kind?: "page" | "cover" | "art" | "image-set" | "artifact" | "sphere" | "body";
  series: string;
  chapter: string;
  page: number;
  sourcePublicPath: string;
  destinationPublicPath: string;
  sourcePath: string;
  destinationPath: string;
};

export type DoujinshiThumbnailPlanItem = DoujinshiThumbnailItem & {
  action: "generate" | "skip";
  reason: "missing" | "stale" | "invalid" | "force" | "fresh";
};

export type DoujinshiThumbnailOptions = {
  items: DoujinshiThumbnailItem[];
  dryRun: boolean;
  force: boolean;
};

export type DoujinshiThumbnailResult = {
  plan: DoujinshiThumbnailPlanItem[];
  generated: number;
  skipped: number;
  failed: Array<{ item: DoujinshiThumbnailItem; message: string }>;
};

export type DoujinshiThumbnailAdapters = {
  renderThumbnail?: (sourcePath: string) => Promise<Uint8Array>;
};

const missingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const inspectImage = async (path: string): Promise<Metadata | undefined> => {
  try {
    return await sharp(path).metadata();
  } catch {
    return undefined;
  }
};

const isValidThumbnail = (metadata: Metadata | undefined): boolean =>
  metadata?.format === "webp" &&
  metadata.width !== undefined &&
  metadata.height !== undefined &&
  metadata.width > 0 &&
  metadata.height > 0 &&
  metadata.width <= doujinshiThumbnailWidth;

const assertValidThumbnail = (metadata: Metadata | undefined, path: string): void => {
  if (!isValidThumbnail(metadata)) {
    throw new Error(`Generated thumbnail is invalid: ${path}`);
  }
};

export const planDoujinshiThumbnails = async (
  options: DoujinshiThumbnailOptions,
): Promise<{ plan: DoujinshiThumbnailPlanItem[] }> => {
  const plan: DoujinshiThumbnailPlanItem[] = [];
  const items = [...options.items].sort((left, right) =>
    left.destinationPublicPath.localeCompare(right.destinationPublicPath),
  );

  for (const item of items) {
    let source;
    try {
      source = await lstat(item.sourcePath);
    } catch (error) {
      if (missingFile(error)) {
        throw new Error(`Missing thumbnail source: ${item.sourcePublicPath}`);
      }
      throw error;
    }
    if (!source.isFile() || source.isSymbolicLink()) {
      throw new Error(`Thumbnail source must be a regular file: ${item.sourcePublicPath}`);
    }
    const sourceMetadata = await inspectImage(item.sourcePath);
    if (
      sourceMetadata?.width === undefined ||
      sourceMetadata.height === undefined ||
      sourceMetadata.width <= 0 ||
      sourceMetadata.height <= 0
    ) {
      throw new Error(`Unreadable thumbnail source: ${item.sourcePublicPath}`);
    }

    let destination;
    try {
      destination = await lstat(item.destinationPath);
    } catch (error) {
      if (missingFile(error)) {
        plan.push({ ...item, action: "generate", reason: options.force ? "force" : "missing" });
        continue;
      }
      throw error;
    }
    if (!destination.isFile() || destination.isSymbolicLink()) {
      throw new Error(`Thumbnail destination must be a regular file: ${item.destinationPublicPath}`);
    }
    if (options.force) {
      plan.push({ ...item, action: "generate", reason: "force" });
      continue;
    }
    if (!isValidThumbnail(await inspectImage(item.destinationPath))) {
      plan.push({ ...item, action: "generate", reason: "invalid" });
      continue;
    }
    if (destination.mtimeMs < source.mtimeMs) {
      plan.push({ ...item, action: "generate", reason: "stale" });
      continue;
    }
    plan.push({ ...item, action: "skip", reason: "fresh" });
  }

  return { plan };
};

const renderThumbnail = async (sourcePath: string): Promise<Uint8Array> =>
  sharp(sourcePath)
    .resize({ width: doujinshiThumbnailWidth, withoutEnlargement: true })
    .webp({ quality: doujinshiThumbnailQuality })
    .toBuffer();

export const generateDoujinshiThumbnails = async (
  options: DoujinshiThumbnailOptions,
  adapters: DoujinshiThumbnailAdapters = {},
): Promise<DoujinshiThumbnailResult> => {
  const { plan } = await planDoujinshiThumbnails(options);
  const result: DoujinshiThumbnailResult = {
    plan,
    generated: 0,
    skipped: plan.filter((item) => item.action === "skip").length,
    failed: [],
  };
  if (options.dryRun) return result;

  const work = plan.filter((item) => item.action === "generate");
  let next = 0;
  const processNext = async (): Promise<void> => {
    const item = work[next];
    next += 1;
    if (!item) return;
    let temporary: string | undefined;
    try {
      const output = await (adapters.renderThumbnail ?? renderThumbnail)(item.sourcePath);
      await mkdir(dirname(item.destinationPath), { recursive: true });
      temporary = `${item.destinationPath}.tmp-${randomUUID()}`;
      await writeFile(temporary, output, { flag: "wx" });
      assertValidThumbnail(await inspectImage(temporary), temporary);
      await rename(temporary, item.destinationPath);
      temporary = undefined;
      result.generated += 1;
    } catch (error) {
      result.failed.push({
        item,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (temporary) await rm(temporary, { force: true });
    }
    await processNext();
  };
  await Promise.all(Array.from({ length: Math.min(4, work.length) }, () => processNext()));
  return result;
};

const requiredString = (value: unknown, label: string, path: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid ${label} in ${path}`);
  }
  return value;
};

export const collectDoujinshiThumbnailItems = (
  entries: MediaContentEntry[],
  root: string,
  seriesFilter?: string,
): DoujinshiThumbnailItem[] => {
  const seriesFormats = new Map<string, string>();
  for (const entry of entries) {
    if (entry.collection !== "mangaSeries") continue;
    const slug = requiredString(entry.data.slug, "series slug", entry.path);
    const format = requiredString(entry.data.format, "series format", entry.path);
    seriesFormats.set(slug, format);
  }
  if (seriesFilter !== undefined) {
    const format = seriesFormats.get(seriesFilter);
    if (format === undefined) throw new Error(`Doujinshi series not found: ${seriesFilter}`);
    if (format !== "doujinshi") throw new Error(`Series is not a doujinshi: ${seriesFilter}`);
  }

  const items: DoujinshiThumbnailItem[] = [];
  for (const entry of entries) {
    if (entry.collection !== "mangaChapters" || entry.data.availability === "unavailable") continue;
    const series = requiredString(entry.data.series, "chapter series", entry.path);
    if (seriesFormats.get(series) !== "doujinshi" || (seriesFilter && series !== seriesFilter)) continue;
    const chapter = requiredString(entry.data.slug, "chapter slug", entry.path);
    const pagePath = requiredString(entry.data.pagePath, "page path", entry.path);
    const pageExtension = requiredString(entry.data.pageExtension, "page extension", entry.path);
    const pageCount = entry.data.pageCount;
    if (!Number.isInteger(pageCount) || (pageCount as number) <= 0) {
      throw new Error(`Invalid page count in ${entry.path}`);
    }

    for (let page = 1; page <= (pageCount as number); page += 1) {
      const sourcePublicPath = createMangaPageSrc(pagePath, page, pageExtension);
      const destinationPublicPath = createDoujinshiThumbnailSrc(pagePath, page);
      items.push({
        series,
        chapter,
        page,
        sourcePublicPath,
        destinationPublicPath,
        sourcePath: resolveMediaUrl(sourcePublicPath, root).filePath,
        destinationPath: resolveMediaUrl(destinationPublicPath, root).filePath,
      });
    }
  }
  return items.sort((left, right) =>
    left.destinationPublicPath.localeCompare(right.destinationPublicPath),
  );
};

const supportedThumbnailFormat = (format: string): boolean =>
  format === "manga" || format === "doujinshi";

export const collectMangaThumbnailItems = (
  entries: MediaContentEntry[],
  root: string,
  seriesFilter?: string,
): DoujinshiThumbnailItem[] => {
  const seriesFormats = new Map<string, string>();
  const items: DoujinshiThumbnailItem[] = [];

  for (const entry of entries) {
    if (entry.collection !== "mangaSeries") continue;
    const series = requiredString(entry.data.slug, "series slug", entry.path);
    const format = requiredString(entry.data.format, "series format", entry.path);
    seriesFormats.set(series, format);
    if (!supportedThumbnailFormat(format) || (seriesFilter && series !== seriesFilter)) continue;

    const cover = entry.data.cover as { src?: unknown } | undefined;
    if (cover?.src !== undefined) {
      const sourcePublicPath = requiredString(cover.src, "cover source", entry.path);
      const destinationPublicPath = createMangaCoverThumbnailSrc(series, sourcePublicPath);
      items.push({
        kind: "cover",
        series,
        chapter: "series",
        page: 0,
        sourcePublicPath,
        destinationPublicPath,
        sourcePath: resolveMediaUrl(sourcePublicPath, root).filePath,
        destinationPath: resolveMediaUrl(destinationPublicPath, root).filePath,
      });
    }

    const art = Array.isArray(entry.data.art) ? entry.data.art : [];
    art.forEach((piece, index) => {
      const sourcePublicPath = requiredString(
        (piece as { src?: unknown })?.src,
        `artwork ${index + 1} source`,
        entry.path,
      );
      if (!isManagedMediaUrl(sourcePublicPath)) return;
      const destinationPublicPath = createMangaArtworkThumbnailSrc(series, index + 1, typeof cover?.src === "string" ? cover.src : undefined);
      items.push({
        kind: "art",
        series,
        chapter: "series",
        page: index + 1,
        sourcePublicPath,
        destinationPublicPath,
        sourcePath: resolveMediaUrl(sourcePublicPath, root).filePath,
        destinationPath: resolveMediaUrl(destinationPublicPath, root).filePath,
      });
    });
  }

  if (seriesFilter !== undefined) {
    const format = seriesFormats.get(seriesFilter);
    if (format === undefined) throw new Error(`Manga or doujinshi series not found: ${seriesFilter}`);
    if (!supportedThumbnailFormat(format)) {
      throw new Error(`Series does not support thumbnails: ${seriesFilter}`);
    }
  }

  for (const entry of entries) {
    if (entry.collection !== "mangaChapters" || entry.data.availability === "unavailable") continue;
    const series = requiredString(entry.data.series, "chapter series", entry.path);
    if (!supportedThumbnailFormat(seriesFormats.get(series) ?? "") || (seriesFilter && series !== seriesFilter)) continue;
    const chapter = requiredString(entry.data.slug, "chapter slug", entry.path);
    const pagePath = requiredString(entry.data.pagePath, "page path", entry.path);
    const pageExtension = requiredString(entry.data.pageExtension, "page extension", entry.path);
    const pageCount = entry.data.pageCount;
    if (!Number.isInteger(pageCount) || (pageCount as number) <= 0) {
      throw new Error(`Invalid page count in ${entry.path}`);
    }
    for (let page = 1; page <= (pageCount as number); page += 1) {
      const sourcePublicPath = createMangaPageSrc(pagePath, page, pageExtension);
      const destinationPublicPath = createDoujinshiThumbnailSrc(pagePath, page);
      items.push({
        kind: "page",
        series,
        chapter,
        page,
        sourcePublicPath,
        destinationPublicPath,
        sourcePath: resolveMediaUrl(sourcePublicPath, root).filePath,
        destinationPath: resolveMediaUrl(destinationPublicPath, root).filePath,
      });
    }
  }

  return items.sort((left, right) =>
    left.destinationPublicPath.localeCompare(right.destinationPublicPath),
  );
};

const collectImageSetThumbnailItems = (
  entries: MediaContentEntry[],
  root: string,
): DoujinshiThumbnailItem[] => {
  const items: DoujinshiThumbnailItem[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.collection !== "imageSets") continue;
    const series = requiredString(entry.data.slug, "image-set slug", entry.path);
    const media = [entry.data.hero, ...(Array.isArray(entry.data.media) ? entry.data.media : [])];
    media.forEach((value, index) => {
      const item = value as { kind?: unknown; src?: unknown } | undefined;
      if (item?.kind !== "image" || typeof item.src !== "string" || !isManagedMediaUrl(item.src)) return;
      const destinationPublicPath = createImageSetThumbnailSrc(series, item.src);
      if (destinationPublicPath === item.src || seen.has(destinationPublicPath)) return;
      seen.add(destinationPublicPath);
      items.push({
        kind: "image-set",
        series,
        chapter: "image-set",
        page: index + 1,
        sourcePublicPath: item.src,
        destinationPublicPath,
        sourcePath: resolveMediaUrl(item.src, root).filePath,
        destinationPath: resolveMediaUrl(destinationPublicPath, root).filePath,
      });
    });
  }
  return items.sort((left, right) =>
    left.destinationPublicPath.localeCompare(right.destinationPublicPath),
  );
};

const collectEditorialThumbnailItems = (
  entries: MediaContentEntry[],
  root: string,
): DoujinshiThumbnailItem[] => {
  const items: DoujinshiThumbnailItem[] = [];
  const seen = new Set<string>();

  const add = (
    entry: MediaContentEntry,
    sourcePublicPath: string,
    kind: "artifact" | "sphere" | "body",
    page: number,
  ): void => {
    if (!isManagedMediaUrl(sourcePublicPath) || !sourcePublicPath.startsWith("/media/images/")) return;
    const destinationPublicPath = createManagedImageThumbnailSrc(sourcePublicPath);
    if (destinationPublicPath === sourcePublicPath || seen.has(destinationPublicPath)) return;
    seen.add(destinationPublicPath);
    items.push({
      kind,
      series: requiredString(entry.data.slug, `${entry.collection} slug`, entry.path),
      chapter: entry.collection,
      page,
      sourcePublicPath,
      destinationPublicPath,
      sourcePath: resolveMediaUrl(sourcePublicPath, root).filePath,
      destinationPath: resolveMediaUrl(destinationPublicPath, root).filePath,
    });
  };

  for (const entry of entries) {
    if (!isPublishedMediaEntry(entry)) continue;
    if (entry.collection === "artifacts") {
      const media = [entry.data.hero, ...(Array.isArray(entry.data.media) ? entry.data.media : [])];
      media.forEach((value, index) => {
        const item = value as { kind?: unknown; src?: unknown } | undefined;
        if (item?.kind === "image" && typeof item.src === "string") {
          add(entry, item.src, "artifact", index + 1);
        }
      });
      collectDenseGalleryImageSources(entry.body).forEach((source, index) => {
        add(entry, source, "body", index + 1);
      });
    }

    if (entry.collection === "spheres") {
      const cover = entry.data.cover as { kind?: unknown; src?: unknown } | undefined;
      if (cover?.kind === "image" && typeof cover.src === "string") {
        add(entry, cover.src, "sphere", 1);
      }
    }
  }

  return items.sort((left, right) =>
    left.destinationPublicPath.localeCompare(right.destinationPublicPath),
  );
};

export const collectMediaThumbnailItems = (
  entries: MediaContentEntry[],
  root: string,
  seriesFilter?: string,
): DoujinshiThumbnailItem[] => [
  ...collectMangaThumbnailItems(entries, root, seriesFilter),
  ...(seriesFilter ? [] : collectImageSetThumbnailItems(entries, root)),
  ...(seriesFilter ? [] : collectEditorialThumbnailItems(entries, root)),
].sort((left, right) =>
  left.destinationPublicPath.localeCompare(right.destinationPublicPath),
);

export const pruneMediaThumbnails = async (options: {
  items: DoujinshiThumbnailItem[];
  root: string;
  dryRun: boolean;
}): Promise<{ planned: string[]; removed: string[] }> => {
  const expected = new Set(options.items.map((item) => item.destinationPath));
  const seriesRoots = new Set<string>();
  for (const item of options.items) {
    const manga = item.destinationPublicPath.match(/^\/manga\/([^/]+)\//);
    if (manga?.[1]) seriesRoots.add(join(options.root, "manga", manga[1]));
    const imageSet = item.destinationPublicPath.match(/^\/media\/images\/([^/]+)\//);
    if (imageSet?.[1]) seriesRoots.add(join(options.root, "images", imageSet[1]));
  }

  const planned: string[] = [];
  const visit = async (directory: string, insideThumbnails = false): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (missingFile(error)) return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        if (insideThumbnails || entry.name === "thumbnails") {
          throw new Error(`Thumbnail cleanup refuses symbolic links: ${path}`);
        }
        continue;
      }
      if (entry.isDirectory()) {
        await visit(path, insideThumbnails || entry.name === "thumbnails");
      } else if (insideThumbnails && entry.isFile() && entry.name.endsWith(".webp") && !expected.has(path)) {
        planned.push(path);
      }
    }
  };

  for (const seriesRoot of [...seriesRoots].sort()) await visit(seriesRoot);
  planned.sort();
  if (!options.dryRun) {
    for (const path of planned) await rm(path);
  }
  return { planned, removed: options.dryRun ? [] : [...planned] };
};

export const pruneMangaThumbnails = pruneMediaThumbnails;
