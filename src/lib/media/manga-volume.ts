import { lstat } from "node:fs/promises";
import {
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  escapeZipEntrySelector,
  listZipEntries,
  type ArchiveEntry,
} from "./archive";
import { MediaError } from "./errors";
import { isIgnoredMediaJunk } from "./optimizer";
import {
  optimizeMedia,
  type OptimizeOptions,
  type OptimizeResult,
} from "./optimizer";
import { runCommand } from "./process";

export type MangaVolumeChapter = {
  number: number;
  pathSegment: string;
  entries: ArchiveEntry[];
};

export type MangaChapterDraft = {
  series: string;
  number: number;
  pathSegment: string;
  pageCount: number;
  pageWidth: number;
  pageHeight: number;
};

export type MangaVolumeImportOptions = {
  source: string;
  series: string;
  quality: number;
  status?: "draft" | "published";
  projectRoot: string;
  mediaRoot: string;
};

export type MangaVolumesImportOptions = Omit<MangaVolumeImportOptions, "source"> & {
  sources: string[];
};

export type MangaVolumeImportResult = {
  chapters: Array<MangaChapterDraft & { contentPath: string; mediaPath: string }>;
};

type MangaVolumeImportAdapters = {
  listEntries?: (archive: string) => Promise<ArchiveEntry[]>;
  extractEntry?: (
    archive: string,
    entry: ArchiveEntry,
    destination: string,
  ) => Promise<void>;
  optimize?: (options: OptimizeOptions) => Promise<OptimizeResult>;
  dimensions?: (path: string) => Promise<{ width: number; height: number }>;
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
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const isVolumeArchive = (path: string): boolean => /\.(?:cbz|zip)$/i.test(path);

export const resolveMangaVolumeSources = async (
  suppliedSources: string[],
): Promise<string[]> => {
  const sources: string[] = [];
  const seen = new Set<string>();

  for (const supplied of suppliedSources) {
    const source = resolve(supplied);
    const info = await lstat(source);
    const candidates = info.isDirectory()
      ? (await readdir(source, { withFileTypes: true }))
          .filter((entry) => entry.isFile() && isVolumeArchive(entry.name))
          .map((entry) => join(source, entry.name))
          .sort(naturalCollator.compare)
      : info.isFile() && isVolumeArchive(source)
        ? [source]
        : [];

    if (candidates.length === 0) {
      throw new Error(`No CBZ/ZIP volume archives found at: ${source}`);
    }
    for (const candidate of candidates) {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        sources.push(candidate);
      }
    }
  }

  return sources;
};

const chapterIdentity = (
  path: string,
): { number: number; pathSegment: string; sortKey: [number, number] } | null => {
  const match = basename(path).match(/ - c(\d+)(?:#(\d+))? \(v\d+\) - p\d+/i);
  if (!match) return null;
  const base = Number(match[1]);
  const bonusText = match[2];
  const bonus = bonusText === undefined ? 0 : Number(bonusText);
  const number = bonusText === undefined ? base : Number(`${base}.${bonusText}`);
  return {
    number,
    pathSegment: `chapter-${String(base).padStart(3, "0")}${bonusText === undefined ? "" : `-${bonusText}`}`,
    sortKey: [base, bonus],
  };
};

export const parseMangaVolumeEntries = (
  entries: ArchiveEntry[],
): MangaVolumeChapter[] => {
  const groups = new Map<
    string,
    MangaVolumeChapter & { sortKey: [number, number] }
  >();

  for (const entry of entries) {
    if (entry.isDirectory || isIgnoredMediaJunk(entry.path)) continue;
    const identity = chapterIdentity(entry.path);
    if (!identity) {
      throw new Error(`Volume importer cannot assign archive file to a chapter: ${entry.path}`);
    }
    const group = groups.get(identity.pathSegment) ?? {
      number: identity.number,
      pathSegment: identity.pathSegment,
      entries: [],
      sortKey: identity.sortKey,
    };
    group.entries.push(entry);
    groups.set(identity.pathSegment, group);
  }

  if (groups.size === 0) {
    throw new Error("Volume archive contains no chapter-labelled pages.");
  }

  return [...groups.values()]
    .sort(
      (left, right) =>
        left.sortKey[0] - right.sortKey[0] ||
        left.sortKey[1] - right.sortKey[1],
    )
    .map(({ sortKey: _sortKey, ...chapter }) => ({
      ...chapter,
      entries: [...chapter.entries].sort((left, right) =>
        naturalCollator.compare(left.path, right.path),
      ),
    }));
};

export const parseWebpInfoDimensions = (
  output: string,
): { width: number; height: number } => {
  const width = output.match(/^\s*Width:\s*(\d+)\s*$/m)?.[1];
  const height = output.match(/^\s*Height:\s*(\d+)\s*$/m)?.[1];
  if (!width || !height) {
    throw new Error("Unable to read optimized page dimensions.");
  }
  return { width: Number(width), height: Number(height) };
};

const readWebpDimensions = async (
  path: string,
): Promise<{ width: number; height: number }> => {
  const result = await runCommand(["webpinfo", "-summary", path]);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to inspect optimized page: ${result.stderr.trim()}`);
  }
  return parseWebpInfoDimensions(new TextDecoder().decode(result.stdout));
};

export const renderMangaChapter = (
  draft: MangaChapterDraft,
  status: "draft" | "published" = "published",
): string => `---
slug: ${draft.series}-${draft.pathSegment}
series: ${draft.series}
number: ${draft.number}
title: Chapter ${draft.number}
pagePath: /manga/${draft.series}/${draft.pathSegment}
pageExtension: webp
pageCount: ${draft.pageCount}
pageWidth: ${draft.pageWidth}
pageHeight: ${draft.pageHeight}
readingDirection: rtl
status: ${status}
---
`;

const extractZipEntry = async (
  archive: string,
  entry: ArchiveEntry,
  destination: string,
): Promise<void> => {
  const result = await runCommand([
    "unzip",
    "-p",
    archive,
    escapeZipEntrySelector(entry.selector ?? entry.path),
  ]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Unable to extract ${entry.path}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`,
    );
  }
  await writeFile(destination, result.stdout, { flag: "wx" });
};

export const importMangaVolume = async (
  options: MangaVolumeImportOptions,
  adapters: MangaVolumeImportAdapters = {},
): Promise<MangaVolumeImportResult> => {
  const source = resolve(options.source);
  const projectRoot = resolve(options.projectRoot);
  const mediaRoot = resolve(options.mediaRoot);
  const seriesContentPath = join(
    projectRoot,
    "src/content/manga/series",
    `${options.series}.md`,
  );
  const chapterContentRoot = join(projectRoot, "src/content/manga/chapters");
  const seriesMediaRoot = join(mediaRoot, "manga", options.series);
  const publishedMedia: string[] = [];
  const publishedContent: string[] = [];
  let extractionRoot: string | undefined;
  let stagingRoot: string | undefined;

  try {
    const sourceInfo = await lstat(source);
    if (!sourceInfo.isFile()) throw new Error(`Volume source is not a file: ${source}`);
    if (!(await pathExists(seriesContentPath))) {
      throw new Error(`Manga series does not exist: ${options.series}`);
    }

    const listEntries = adapters.listEntries ?? ((archive) => listZipEntries(archive));
    const chapters = parseMangaVolumeEntries(await listEntries(source));
    const targets = chapters.map((chapter) => ({
      chapter,
      mediaPath: join(seriesMediaRoot, chapter.pathSegment),
      contentPath: join(
        chapterContentRoot,
        `${options.series}-${chapter.pathSegment}.md`,
      ),
    }));
    for (const target of targets) {
      if (await pathExists(target.mediaPath)) {
        throw new Error(`Chapter media already exists: ${target.mediaPath}`);
      }
      if (await pathExists(target.contentPath)) {
        throw new Error(`Chapter content already exists: ${target.contentPath}`);
      }
    }

    await mkdir(seriesMediaRoot, { recursive: true });
    await mkdir(chapterContentRoot, { recursive: true });
    stagingRoot = await mkdtemp(join(seriesMediaRoot, ".volume-import-"));
    extractionRoot = await mkdtemp(join(tmpdir(), "astrosphere-volume-"));
    const extractEntry = adapters.extractEntry ?? extractZipEntry;
    const optimize = adapters.optimize ?? optimizeMedia;
    const dimensions = adapters.dimensions ?? readWebpDimensions;
    const drafts: MangaChapterDraft[] = [];

    for (const { chapter } of targets) {
      const sourceDirectory = join(extractionRoot, chapter.pathSegment);
      const optimizedDirectory = join(stagingRoot, chapter.pathSegment);
      await mkdir(sourceDirectory);
      for (let index = 0; index < chapter.entries.length; index += 1) {
        await extractEntry(
          source,
          chapter.entries[index]!,
          join(sourceDirectory, `${String(index + 1).padStart(4, "0")}.source`),
        );
      }

      const optimized = await optimize({
        source: sourceDirectory,
        destination: optimizedDirectory,
        profile: "reader",
        quality: options.quality,
        dryRun: false,
        webReader: true,
      });
      const size = await dimensions(join(optimizedDirectory, "001.webp"));
      drafts.push({
        series: options.series,
        number: chapter.number,
        pathSegment: chapter.pathSegment,
        pageCount: optimized.plan.items.length,
        pageWidth: size.width,
        pageHeight: size.height,
      });
      await rm(sourceDirectory, { recursive: true, force: true });
    }

    for (const target of targets) {
      await rename(join(stagingRoot, target.chapter.pathSegment), target.mediaPath);
      publishedMedia.push(target.mediaPath);
    }
    for (let index = 0; index < targets.length; index += 1) {
      const contentPath = targets[index]!.contentPath;
      await writeFile(
        contentPath,
        renderMangaChapter(drafts[index]!, options.status),
        {
        flag: "wx",
        },
      );
      publishedContent.push(contentPath);
    }

    return {
      chapters: drafts.map((draft, index) => ({
        ...draft,
        contentPath: targets[index]!.contentPath,
        mediaPath: targets[index]!.mediaPath,
      })),
    };
  } catch (error) {
    for (const path of publishedContent.reverse()) {
      await rm(path, { force: true });
    }
    for (const path of publishedMedia.reverse()) {
      await rm(path, { recursive: true, force: true });
    }
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "optimization",
      `Unable to import manga volume: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    if (stagingRoot) await rm(stagingRoot, { recursive: true, force: true });
    if (extractionRoot) await rm(extractionRoot, { recursive: true, force: true });
  }
};

export const importMangaVolumes = async (
  options: MangaVolumesImportOptions,
  adapters: MangaVolumeImportAdapters = {},
): Promise<MangaVolumeImportResult> => {
  try {
    const sources = await resolveMangaVolumeSources(options.sources);
    const chapters: MangaVolumeImportResult["chapters"] = [];
    for (const source of sources) {
      const result = await importMangaVolume({ ...options, source }, adapters);
      chapters.push(...result.chapters);
    }
    return { chapters };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "optimization",
      `Unable to import manga volumes: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
