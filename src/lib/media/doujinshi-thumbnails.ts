import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import sharp, { type Metadata } from "sharp";
import {
  createDoujinshiThumbnailSrc,
  createMangaPageSrc,
} from "../manga-reader";
import type { MediaContentEntry } from "./content-source";
import { resolveMediaUrl } from "./paths";

export const doujinshiThumbnailWidth = 320;
export const doujinshiThumbnailQuality = 70;

export type DoujinshiThumbnailItem = {
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
        throw new Error(`Missing doujinshi reader page: ${item.sourcePublicPath}`);
      }
      throw error;
    }
    if (!source.isFile() || source.isSymbolicLink()) {
      throw new Error(`Doujinshi reader page must be a regular file: ${item.sourcePublicPath}`);
    }
    const sourceMetadata = await inspectImage(item.sourcePath);
    if (
      sourceMetadata?.width === undefined ||
      sourceMetadata.height === undefined ||
      sourceMetadata.width <= 0 ||
      sourceMetadata.height <= 0
    ) {
      throw new Error(`Unreadable doujinshi reader page: ${item.sourcePublicPath}`);
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

  for (const item of plan) {
    if (item.action === "skip") continue;
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
  }
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
