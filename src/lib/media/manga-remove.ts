import { randomUUID } from "node:crypto";
import {
  lstat,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseContentDocument } from "./content-source";
import { MediaError } from "./errors";
import { resolveMediaUrl } from "./paths";

export type MangaChapterUnavailableOptions = {
  projectRoot: string;
  mediaRoot: string;
  series: string;
  chapter: number;
};

export type MangaChapterUnavailablePlan = MangaChapterUnavailableOptions & {
  contentPath: string;
  mediaPath: string;
  fileCount: number;
  totalBytes: number;
  originalContent: string;
  unavailableContent: string;
};

const readerFields = new Set([
  "availability",
  "pagePath",
  "pageExtension",
  "pageCount",
  "pageWidth",
  "pageHeight",
  "readingDirection",
]);

export const markMangaChapterUnavailable = (source: string): string => {
  const match = source.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/);
  if (!match) throw new Error("Chapter content has invalid frontmatter.");
  const newline = match[1]!.includes("\r\n") ? "\r\n" : "\n";
  const lines = match[2]!
    .split(/\r?\n/)
    .filter((line) => !readerFields.has(line.match(/^([A-Za-z][A-Za-z0-9]*):/)?.[1] ?? ""));
  const statusIndex = lines.findIndex((line) => line.startsWith("status:"));
  lines.splice(statusIndex < 0 ? lines.length : statusIndex, 0, "availability: unavailable");
  return `${match[1]}${lines.join(newline)}${match[3]}${source.slice(match[0].length)}`;
};

const directoryMetrics = async (
  directory: string,
): Promise<{ fileCount: number; totalBytes: number }> => {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Chapter media is not a safe directory: ${directory}`);
  }
  let fileCount = 0;
  let totalBytes = 0;
  const walk = async (path: string): Promise<void> => {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Chapter media contains a symbolic link: ${child}`);
      }
      if (entry.isDirectory()) {
        await walk(child);
      } else if (entry.isFile()) {
        const stats = await lstat(child);
        fileCount += 1;
        totalBytes += stats.size;
      }
    }
  };
  await walk(directory);
  return { fileCount, totalBytes };
};

export const planMangaChapterUnavailable = async (
  options: MangaChapterUnavailableOptions,
): Promise<MangaChapterUnavailablePlan> => {
  try {
    const projectRoot = resolve(options.projectRoot);
    const mediaRoot = resolve(options.mediaRoot);
    const chapterRoot = join(projectRoot, "src/content/manga/chapters");
    const matches: Array<{
      contentPath: string;
      originalContent: string;
      pagePath: string;
      pageExtension: string;
    }> = [];

    for (const entry of await readdir(chapterRoot, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const contentPath = join(chapterRoot, entry.name);
      const originalContent = await readFile(contentPath, "utf8");
      const parsed = parseContentDocument(
        originalContent,
        contentPath,
        "mangaChapters",
      );
      if (
        parsed.data.series === options.series &&
        parsed.data.number === options.chapter
      ) {
        if (parsed.data.availability === "unavailable") {
          throw new Error("Chapter is already currently unavailable.");
        }
        if (
          typeof parsed.data.pagePath !== "string" ||
          typeof parsed.data.pageExtension !== "string"
        ) {
          throw new Error("Chapter has no removable reader media.");
        }
        matches.push({
          contentPath,
          originalContent,
          pagePath: parsed.data.pagePath,
          pageExtension: parsed.data.pageExtension,
        });
      }
    }
    if (matches.length !== 1) {
      throw new Error(
        matches.length === 0
          ? `Manga chapter not found: ${options.series} chapter ${options.chapter}`
          : `Multiple manga chapters match: ${options.series} chapter ${options.chapter}`,
      );
    }

    const match = matches[0]!;
    const resolvedPage = resolveMediaUrl(
      `${match.pagePath.replace(/\/+$/, "")}/001.${match.pageExtension}`,
      mediaRoot,
    );
    if (resolvedPage.namespace !== "manga") {
      throw new Error("Chapter media is outside the manga media root.");
    }
    const mediaPath = dirname(resolvedPage.filePath);
    const metrics = await directoryMetrics(mediaPath);
    return {
      ...options,
      projectRoot,
      mediaRoot,
      contentPath: match.contentPath,
      mediaPath,
      ...metrics,
      originalContent: match.originalContent,
      unavailableContent: markMangaChapterUnavailable(match.originalContent),
    };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "validation",
      `Unable to mark manga chapter unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const executeMangaChapterUnavailable = async (
  plan: MangaChapterUnavailablePlan,
): Promise<void> => {
  const currentContent = await readFile(plan.contentPath, "utf8");
  if (currentContent !== plan.originalContent) {
    throw new MediaError(
      "validation",
      "Chapter content changed after the removal preview; run the command again.",
    );
  }

  const temporaryContent = `${plan.contentPath}.unavailable-${randomUUID()}`;
  try {
    await writeFile(temporaryContent, plan.unavailableContent, { flag: "wx" });
    await rename(temporaryContent, plan.contentPath);
    await rm(plan.mediaPath, { recursive: true });
  } finally {
    await rm(temporaryContent, { force: true });
  }
};
