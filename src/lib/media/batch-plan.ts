import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import {
  fingerprintBatchEntry,
  type BatchChapter,
  type BatchEntry,
  type BatchManifest,
} from "./batch-manifest";
import { listZipEntries, readZipEntryHeader, type ArchiveEntry } from "./archive";
import { detectImageFormatFromBytes, type ImageFormat } from "./image-format";
import { isIgnoredMediaJunk, naturalSortMediaPaths } from "./optimizer";

export type SupportedBatchImageFormat = "jpeg" | "png" | "gif" | "webp";

export type PlannedPage = {
  ordinal: number;
  entry: ArchiveEntry;
  format: SupportedBatchImageFormat;
};

export type PlannedBatchEntry = {
  manifest: BatchEntry;
  slug: string;
  archivePath: string;
  archiveSha256: string;
  fingerprint: string;
  pages: PlannedPage[];
  chapterPages: Map<number, PlannedPage[]>;
  ignored: string[];
  destinations: string[];
  state: "create" | "replace" | "already-complete";
};

export type BatchImportPlan = {
  source: string;
  projectRoot: string;
  mediaRoot: string;
  status: "draft" | "published";
  entries: PlannedBatchEntry[];
  unlistedArchives: string[];
};

export type BatchPlanOptions = {
  source: string;
  manifest: BatchManifest;
  projectRoot: string;
  mediaRoot: string;
  status: "draft" | "published";
};

export type ImportRecord = {
  version: 1;
  slug: string;
  fingerprint: string;
  outputs: Array<{
    scope: "project" | "media";
    path: string;
    sha256: string;
  }>;
};

export type BatchPlanAdapters = {
  listEntries?: (archive: string) => Promise<ArchiveEntry[]>;
  inspectEntry?: (entry: ArchiveEntry, archive: string) => Promise<ImageFormat>;
  hashFile?: (path: string) => Promise<string>;
  pathExists?: (path: string) => Promise<boolean>;
  readRecord?: (path: string) => Promise<ImportRecord | null>;
};

const naturalCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
};

export const hashBatchFile = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};

const readImportRecord = async (path: string): Promise<ImportRecord | null> => {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as ImportRecord;
    if (value.version !== 1 || !Array.isArray(value.outputs)) return null;
    return value;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    return null;
  }
};

const inspectArchiveEntry = async (
  entry: ArchiveEntry,
  archive: string,
): Promise<ImageFormat> =>
  detectImageFormatFromBytes(await readZipEntryHeader(archive, entry));

const entrySlug = (entry: BatchEntry): string =>
  entry.type === "image-set"
    ? entry.imageSet.slug
    : typeof entry.series === "string"
      ? entry.series
      : entry.series.slug;

const chapterSegment = (number: number): string => {
  const [whole, decimal] = String(number).split(".");
  return `chapter-${whole!.padStart(3, "0")}${decimal ? `-${decimal}` : ""}`;
};

const destinationsFor = (
  entry: BatchEntry,
  projectRoot: string,
  mediaRoot: string,
): string[] => {
  const slug = entrySlug(entry);
  if (entry.type === "image-set") {
    return [
      join(projectRoot, "src/content/image-sets", `${slug}.md`),
      join(mediaRoot, "images", slug),
    ];
  }
  const chapterContent = entry.chapters.map((chapter) =>
    join(projectRoot, "src/content/manga/chapters", `${slug}-${chapterSegment(chapter.number)}.md`),
  );
  const chapterMedia = entry.chapters.map((chapter) =>
    join(mediaRoot, "manga", slug, chapterSegment(chapter.number)),
  );
  return entry.mode === "create"
    ? [
        join(projectRoot, "src/content/manga/series", `${slug}.md`),
        join(mediaRoot, "manga", slug),
        ...chapterContent,
      ]
    : [...chapterContent, ...chapterMedia];
};

const recordMatches = async (
  record: ImportRecord | null,
  fingerprint: string,
  projectRoot: string,
  mediaRoot: string,
  exists: (path: string) => Promise<boolean>,
  hashFile: (path: string) => Promise<string>,
): Promise<boolean> => {
  if (!record || record.fingerprint !== fingerprint || record.outputs.length === 0) return false;
  for (const output of record.outputs) {
    const root = output.scope === "project" ? projectRoot : mediaRoot;
    const path = join(root, output.path);
    if (!(await exists(path)) || (await hashFile(path)) !== output.sha256) return false;
  }
  return true;
};

const selectChapterPages = (
  chapters: BatchChapter[],
  pages: PlannedPage[],
  slug: string,
): Map<number, PlannedPage[]> => {
  const selected = new Map<number, PlannedPage[]>();
  for (const chapter of chapters) {
    const selection = chapter.pages;
    const chapterPages = selection === "all"
      ? pages
      : pages.filter(
          (page) => page.ordinal >= selection.from && page.ordinal <= selection.to,
        );
    if (chapterPages.length === 0) {
      throw new Error(`${slug} chapter ${chapter.number} selects no pages`);
    }
    if (selection !== "all" && chapterPages.length !== selection.to - selection.from + 1) {
      throw new Error(`${slug} chapter ${chapter.number} selects pages outside the archive`);
    }
    selected.set(chapter.number, chapterPages);
  }
  const ordinals = [...selected.values()].flat().map((page) => page.ordinal);
  if (new Set(ordinals).size !== pages.length || ordinals.length !== pages.length) {
    throw new Error(`${slug} chapter selection does not assign every accepted page exactly once`);
  }
  return selected;
};

export const planBatchImport = async (
  options: BatchPlanOptions,
  adapters: BatchPlanAdapters = {},
): Promise<BatchImportPlan> => {
  const source = resolve(options.source);
  const projectRoot = resolve(options.projectRoot);
  const mediaRoot = resolve(options.mediaRoot);
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isDirectory()) throw new Error(`Batch source is not a directory: ${source}`);

  const listed = new Set(options.manifest.entries.map((entry) => entry.archive));
  const sourceFiles = (await readdir(source, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const unlistedArchives = sourceFiles
    .filter((name) => /\.(?:zip|cbz)$/i.test(name) && !listed.has(name))
    .sort(naturalCollator.compare);
  const listEntries = adapters.listEntries ?? listZipEntries;
  const inspectEntry = adapters.inspectEntry ?? inspectArchiveEntry;
  const hashFile = adapters.hashFile ?? hashBatchFile;
  const exists = adapters.pathExists ?? pathExists;
  const readRecord = adapters.readRecord ?? readImportRecord;
  const planned: PlannedBatchEntry[] = [];

  for (const manifestEntry of options.manifest.entries) {
    const slug = entrySlug(manifestEntry);
    const archivePath = join(source, manifestEntry.archive);
    if (!(await exists(archivePath))) throw new Error(`Listed archive does not exist: ${manifestEntry.archive}`);
    const archiveInfo = await lstat(archivePath);
    if (!archiveInfo.isFile()) throw new Error(`Listed archive is not a file: ${manifestEntry.archive}`);
    const archiveSha256 = await hashFile(archivePath);
    const fingerprint = fingerprintBatchEntry(manifestEntry, archiveSha256);
    const recordPath = join(mediaRoot, ".astrosphere/import-records", `${slug}.json`);
    const destinations = destinationsFor(manifestEntry, projectRoot, mediaRoot);
    if (
      await recordMatches(
        await readRecord(recordPath),
        fingerprint,
        projectRoot,
        mediaRoot,
        exists,
        hashFile,
      )
    ) {
      planned.push({
        manifest: manifestEntry,
        slug,
        archivePath,
        archiveSha256,
        fingerprint,
        pages: [],
        chapterPages: new Map(),
        ignored: [],
        destinations,
        state: "already-complete",
      });
      continue;
    }
    const entries = await listEntries(archivePath);
    const ignored: string[] = [];
    const candidates: ArchiveEntry[] = [];
    for (const archiveEntry of entries) {
      if (archiveEntry.isDirectory) continue;
      if (
        isIgnoredMediaJunk(archiveEntry.path) ||
        options.manifest.defaults.ignoreEntries.includes(basename(archiveEntry.path))
      ) {
        ignored.push(basename(archiveEntry.path));
      } else {
        candidates.push(archiveEntry);
      }
    }
    const ordered = naturalSortMediaPaths(candidates.map((entry) => entry.path));
    const byPath = new Map(candidates.map((entry) => [entry.path, entry]));
    const pages: PlannedPage[] = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const archiveEntry = byPath.get(ordered[index]!)!;
      const format = await inspectEntry(archiveEntry, archivePath);
      if (format === "avif") throw new Error(`${manifestEntry.archive}: AVIF input is unsupported: ${archiveEntry.path}`);
      if (format === "unknown") throw new Error(`${manifestEntry.archive}: unsupported archive entry: ${archiveEntry.path}`);
      pages.push({ ordinal: index + 1, entry: archiveEntry, format });
    }
    if (pages.length === 0) throw new Error(`${manifestEntry.archive} contains no accepted images`);

    const chapterPages = manifestEntry.type === "doujinshi"
      ? selectChapterPages(manifestEntry.chapters, pages, slug)
      : new Map<number, PlannedPage[]>();
    let state: PlannedBatchEntry["state"];
    if (manifestEntry.type === "doujinshi" && manifestEntry.mode === "update") {
      const seriesPath = join(projectRoot, "src/content/manga/series", `${slug}.md`);
      if (!(await exists(seriesPath))) throw new Error(`Existing series does not exist: ${slug}`);
      for (const destination of destinations) {
        if (!(await exists(destination))) throw new Error(`Replacement target does not exist: ${destination}`);
      }
      state = "replace";
    } else {
      for (const destination of destinations) {
        if (await exists(destination)) throw new Error(`Import destination already exists: ${destination}`);
      }
      state = "create";
    }
    planned.push({
      manifest: manifestEntry,
      slug,
      archivePath,
      archiveSha256,
      fingerprint,
      pages,
      chapterPages,
      ignored: [...new Set(ignored)].sort((left, right) => {
        const leftIndex = options.manifest.defaults.ignoreEntries.indexOf(left);
        const rightIndex = options.manifest.defaults.ignoreEntries.indexOf(right);
        if (leftIndex !== -1 || rightIndex !== -1) {
          if (leftIndex === -1) return 1;
          if (rightIndex === -1) return -1;
          return leftIndex - rightIndex;
        }
        return naturalCollator.compare(left, right);
      }),
      destinations,
      state,
    });
  }

  return {
    source,
    projectRoot,
    mediaRoot,
    status: options.status,
    entries: planned,
    unlistedArchives,
  };
};

export const relativeImportOutput = (
  path: string,
  projectRoot: string,
  mediaRoot: string,
): { scope: "project" | "media"; path: string } => {
  const projectPath = relative(projectRoot, path);
  if (!projectPath.startsWith("..")) return { scope: "project", path: projectPath };
  return { scope: "media", path: relative(mediaRoot, path) };
};
