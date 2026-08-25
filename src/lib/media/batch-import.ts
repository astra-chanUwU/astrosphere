import { randomUUID } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  escapeZipEntrySelector,
  type ArchiveEntry,
} from "./archive";
import {
  batchChapterSegment,
  renderDoujinshiChapter,
  renderDoujinshiSeries,
  renderImageSet,
  type RenderedImage,
} from "./batch-content";
import { loadBatchManifest } from "./batch-manifest";
import {
  hashBatchFile,
  planBatchImport,
  relativeImportOutput,
  type BatchImportPlan,
  type BatchPlanAdapters,
  type BatchPlanOptions,
  type ImportRecord,
  type PlannedBatchEntry,
} from "./batch-plan";
import { parseWebpInfoDimensions } from "./manga-volume";
import { optimizeMedia, type OptimizeOptions, type OptimizeResult } from "./optimizer";
import { runCommand } from "./process";
import {
  generateDoujinshiThumbnails,
  type DoujinshiThumbnailItem,
} from "./doujinshi-thumbnails";
import {
  createDoujinshiThumbnailSrc,
  createMangaPageSrc,
} from "../manga-reader";

export type BatchImportOptions = Omit<BatchPlanOptions, "manifest"> & {
  manifest: string;
  quality: number;
  dryRun: boolean;
};

export type BatchImportFailure = { slug: string; message: string };

export type BatchImportResult = {
  plan: BatchImportPlan;
  created: number;
  replaced: number;
  alreadyComplete: number;
  failed: BatchImportFailure[];
  converted: number;
  copied: number;
  ignored: number;
  originalBytes: number;
  optimizedBytes: number;
  quarantines: string[];
  dryRun: boolean;
};

type BatchImportAdapters = {
  listEntries?: BatchPlanAdapters["listEntries"];
  inspectEntry?: BatchPlanAdapters["inspectEntry"];
  hashFile?: (path: string) => Promise<string>;
  pathExists?: BatchPlanAdapters["pathExists"];
  readRecord?: BatchPlanAdapters["readRecord"];
  extractEntry?: (
    archive: string,
    entry: ArchiveEntry,
    destination: string,
  ) => Promise<void>;
  optimize?: (options: OptimizeOptions) => Promise<OptimizeResult>;
  generateThumbnails?: typeof generateDoujinshiThumbnails;
  dimensions?: (path: string) => Promise<{ width: number; height: number }>;
  afterActivation?: (entry: PlannedBatchEntry) => void | Promise<void>;
};

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
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, result.stdout, { flag: "wx" });
};

const readWebpDimensions = async (
  path: string,
): Promise<{ width: number; height: number }> => {
  const result = await runCommand(["webpinfo", "-summary", path]);
  if (result.exitCode !== 0) {
    throw new Error(`Unable to inspect optimized image: ${basename(path)}`);
  }
  return parseWebpInfoDimensions(new TextDecoder().decode(result.stdout));
};

const listFiles = async (root: string): Promise<string[]> => {
  const files: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  await visit(root);
  return files;
};

const writeImportRecord = async (
  path: string,
  record: ImportRecord,
): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
};

const importRecordFor = async (
  entry: PlannedBatchEntry,
  paths: string[],
  plan: BatchImportPlan,
  hashFile: (path: string) => Promise<string>,
): Promise<ImportRecord> => ({
  version: 1,
  slug: entry.slug,
  fingerprint: entry.fingerprint,
  outputs: await Promise.all(
    paths.map(async (path) => ({
      ...relativeImportOutput(path, plan.projectRoot, plan.mediaRoot),
      sha256: await hashFile(path),
    })),
  ),
});

const extractReaderPages = async (
  entry: PlannedBatchEntry,
  chapterNumber: number,
  destination: string,
  extract: NonNullable<BatchImportAdapters["extractEntry"]>,
): Promise<void> => {
  await mkdir(destination, { recursive: true });
  const pages = entry.chapterPages.get(chapterNumber)!;
  for (let index = 0; index < pages.length; index += 1) {
    await extract(
      entry.archivePath,
      pages[index]!.entry,
      join(destination, `${String(index + 1).padStart(4, "0")}.source`),
    );
  }
};

const statusFromExistingChapter = async (
  path: string,
): Promise<"draft" | "published"> => {
  const source = await readFile(path, "utf8");
  return /^status:\s+draft\s*$/m.test(source) ? "draft" : "published";
};

type StagedEntry = {
  readyMedia: string;
  content: Array<{ path: string; source: string }>;
  optimization: OptimizeResult[];
};

const stageDoujinshi = async (
  entry: PlannedBatchEntry,
  plan: BatchImportPlan,
  stageRoot: string,
  quality: number,
  adapters: BatchImportAdapters,
): Promise<StagedEntry> => {
  if (entry.manifest.type !== "doujinshi") throw new Error("Expected doujinshi entry");
  const extract = adapters.extractEntry ?? extractZipEntry;
  const optimize = adapters.optimize ?? optimizeMedia;
  const generateThumbnails = adapters.generateThumbnails ?? generateDoujinshiThumbnails;
  const dimensions = adapters.dimensions ?? readWebpDimensions;
  const extractedRoot = join(stageRoot, "extracted");
  const readyMedia = join(stageRoot, "ready");
  await mkdir(readyMedia, { recursive: true });
  const content: StagedEntry["content"] = [];
  const optimization: OptimizeResult[] = [];
  let firstPage: RenderedImage | undefined;

  for (const chapter of entry.manifest.chapters) {
    const segment = batchChapterSegment(chapter.number);
    const source = join(extractedRoot, segment);
    const destination = join(readyMedia, segment);
    await extractReaderPages(entry, chapter.number, source, extract);
    const optimized = await optimize({
      source,
      destination,
      profile: "reader",
      quality,
      dryRun: false,
      webReader: true,
    });
    optimization.push(optimized);
    const pagePath = `/manga/${entry.slug}/${segment}`;
    const thumbnailItems: DoujinshiThumbnailItem[] = optimized.plan.items.map((_, index) => {
      const page = index + 1;
      const sourcePublicPath = createMangaPageSrc(pagePath, page, "webp");
      const destinationPublicPath = createDoujinshiThumbnailSrc(pagePath, page);
      return {
        series: entry.slug,
        chapter: `${entry.slug}-${segment}`,
        page,
        sourcePublicPath,
        destinationPublicPath,
        sourcePath: join(destination, `${String(page).padStart(3, "0")}.webp`),
        destinationPath: join(destination, "thumbnails", `${String(page).padStart(3, "0")}.webp`),
      };
    });
    const thumbnailResult = await generateThumbnails({
      items: thumbnailItems,
      dryRun: false,
      force: true,
    });
    if (thumbnailResult.failed.length > 0) {
      const first = thumbnailResult.failed[0]!;
      throw new Error(
        `Thumbnail generation failed for ${first.item.sourcePublicPath}: ${first.message} (${thumbnailResult.failed.length} failed)`,
      );
    }
    const firstPath = join(destination, "001.webp");
    const size = await dimensions(firstPath);
    firstPage ??= {
      src: `/manga/${entry.slug}/cover.webp`,
      width: size.width,
      height: size.height,
    };
    const contentPath = join(
      plan.projectRoot,
      "src/content/manga/chapters",
      `${entry.slug}-${segment}.md`,
    );
    const status = entry.manifest.mode === "update"
      ? await statusFromExistingChapter(contentPath)
      : plan.status;
    content.push({
      path: contentPath,
      source: renderDoujinshiChapter(
        entry.slug,
        chapter,
        {
          pageCount: optimized.plan.items.length,
          width: size.width,
          height: size.height,
        },
        status,
      ),
    });
  }

  if (entry.manifest.mode === "create") {
    await copyFile(join(readyMedia, batchChapterSegment(entry.manifest.chapters[0]!.number), "001.webp"), join(readyMedia, "cover.webp"));
    content.unshift({
      path: join(plan.projectRoot, "src/content/manga/series", `${entry.slug}.md`),
      source: renderDoujinshiSeries(entry.manifest, firstPage!, plan.status),
    });
  }
  return { readyMedia, content, optimization };
};

const stageImageSet = async (
  entry: PlannedBatchEntry,
  plan: BatchImportPlan,
  stageRoot: string,
  quality: number,
  adapters: BatchImportAdapters,
): Promise<StagedEntry> => {
  if (entry.manifest.type !== "image-set") throw new Error("Expected image-set entry");
  const extract = adapters.extractEntry ?? extractZipEntry;
  const optimize = adapters.optimize ?? optimizeMedia;
  const dimensions = adapters.dimensions ?? readWebpDimensions;
  const extractedRoot = join(stageRoot, "extracted");
  const readyMedia = join(stageRoot, "ready");
  await mkdir(extractedRoot, { recursive: true });
  for (const page of entry.pages) {
    await extract(entry.archivePath, page.entry, join(extractedRoot, page.entry.path));
  }
  const optimized = await optimize({
    source: extractedRoot,
    destination: readyMedia,
    profile: "gallery",
    quality,
    dryRun: false,
    webReader: true,
  });
  const images: RenderedImage[] = [];
  for (const item of optimized.plan.items) {
    const output = join(readyMedia, item.outputRelativePath);
    const size = await dimensions(output);
    images.push({
      src: `/media/images/${entry.slug}/${item.outputRelativePath.replaceAll("\\", "/")}`,
      width: size.width,
      height: size.height,
    });
  }
  return {
    readyMedia,
    content: [{
      path: join(plan.projectRoot, "src/content/image-sets", `${entry.slug}.md`),
      source: renderImageSet(entry.manifest, images, plan.status),
    }],
    optimization: [optimized],
  };
};

const publishNewEntry = async (
  entry: PlannedBatchEntry,
  staged: StagedEntry,
  plan: BatchImportPlan,
  afterActivation?: BatchImportAdapters["afterActivation"],
): Promise<{ outputs: string[]; quarantine?: string }> => {
  const mediaDestination = entry.manifest.type === "image-set"
    ? join(plan.mediaRoot, "images", entry.slug)
    : join(plan.mediaRoot, "manga", entry.slug);
  const writtenContent: string[] = [];
  let mediaPublished = false;
  try {
    await mkdir(dirname(mediaDestination), { recursive: true });
    await rename(staged.readyMedia, mediaDestination);
    mediaPublished = true;
    for (const item of staged.content) {
      await mkdir(dirname(item.path), { recursive: true });
      await writeFile(item.path, item.source, { flag: "wx" });
      writtenContent.push(item.path);
    }
    await afterActivation?.(entry);
    return {
      outputs: [...writtenContent, ...(await listFiles(mediaDestination))],
    };
  } catch (error) {
    for (const path of writtenContent.reverse()) await rm(path, { force: true });
    if (mediaPublished) await rm(mediaDestination, { recursive: true, force: true });
    throw error;
  }
};

const publishReplacement = async (
  entry: PlannedBatchEntry,
  staged: StagedEntry,
  plan: BatchImportPlan,
  operationId: string,
  afterActivation?: BatchImportAdapters["afterActivation"],
): Promise<{ outputs: string[]; quarantine: string }> => {
  if (entry.manifest.type !== "doujinshi" || entry.manifest.mode !== "update") {
    throw new Error("Expected replacement entry");
  }
  const quarantine = join(plan.mediaRoot, ".astrosphere/quarantine", operationId, entry.slug);
  const mediaBackupRoot = join(quarantine, "media");
  const contentBackupRoot = join(quarantine, "content");
  await mkdir(mediaBackupRoot, { recursive: true });
  await mkdir(contentBackupRoot, { recursive: true });
  const movedMedia: Array<{ current: string; backup: string }> = [];
  const backedContent: Array<{ current: string; backup: string }> = [];
  const activatedMedia: string[] = [];
  try {
    for (const chapter of entry.manifest.chapters) {
      const segment = batchChapterSegment(chapter.number);
      const current = join(plan.mediaRoot, "manga", entry.slug, segment);
      const backup = join(mediaBackupRoot, segment);
      await rename(current, backup);
      movedMedia.push({ current, backup });
      await rename(join(staged.readyMedia, segment), current);
      activatedMedia.push(current);
    }
    for (const item of staged.content) {
      const backup = join(contentBackupRoot, basename(item.path));
      await copyFile(item.path, backup);
      backedContent.push({ current: item.path, backup });
      const temporary = `${item.path}.tmp-${operationId}`;
      await writeFile(temporary, item.source, { flag: "wx" });
      await rename(temporary, item.path);
    }
    await afterActivation?.(entry);
    return {
      outputs: [
        ...staged.content.map((item) => item.path),
        ...(await Promise.all(activatedMedia.map(listFiles))).flat(),
      ],
      quarantine,
    };
  } catch (error) {
    for (const path of activatedMedia.reverse()) await rm(path, { recursive: true, force: true });
    for (const item of movedMedia.reverse()) {
      try {
        await rename(item.backup, item.current);
      } catch {
        // Preserve the original activation error; the quarantine remains recoverable.
      }
    }
    for (const item of backedContent.reverse()) {
      try {
        await copyFile(item.backup, item.current);
      } catch {
        // Preserve the original activation error; the quarantine remains recoverable.
      }
    }
    throw error;
  }
};

const emptyResult = (plan: BatchImportPlan, dryRun: boolean): BatchImportResult => ({
  plan,
  created: 0,
  replaced: 0,
  alreadyComplete: plan.entries.filter((entry) => entry.state === "already-complete").length,
  failed: [],
  converted: 0,
  copied: 0,
  ignored: plan.entries.reduce((total, entry) => total + entry.ignored.length, 0),
  originalBytes: 0,
  optimizedBytes: 0,
  quarantines: [],
  dryRun,
});

export const executeBatchImport = async (
  plan: BatchImportPlan,
  quality: number,
  adapters: BatchImportAdapters = {},
): Promise<BatchImportResult> => {
  const result = emptyResult(plan, false);
  const hashFile = adapters.hashFile ?? hashBatchFile;
  for (const entry of plan.entries) {
    if (entry.state === "already-complete") continue;
    const operationId = randomUUID();
    const operationRoot = join(plan.mediaRoot, ".astrosphere/imports", operationId, entry.slug);
    try {
      await mkdir(operationRoot, { recursive: true });
      const staged = entry.manifest.type === "image-set"
        ? await stageImageSet(entry, plan, operationRoot, quality, adapters)
        : await stageDoujinshi(entry, plan, operationRoot, quality, adapters);
      const published = entry.state === "replace"
        ? await publishReplacement(entry, staged, plan, operationId, adapters.afterActivation)
        : await publishNewEntry(entry, staged, plan, adapters.afterActivation);
      const recordPath = join(plan.mediaRoot, ".astrosphere/import-records", `${entry.slug}.json`);
      await writeImportRecord(
        recordPath,
        await importRecordFor(entry, published.outputs, plan, hashFile),
      );
      for (const optimization of staged.optimization) {
        result.converted += optimization.converted;
        result.copied += optimization.copied;
        result.originalBytes += optimization.originalBytes;
        result.optimizedBytes += optimization.optimizedBytes;
      }
      if (entry.state === "replace") result.replaced += 1;
      else result.created += 1;
      if (published.quarantine) result.quarantines.push(published.quarantine);
    } catch (error) {
      result.failed.push({
        slug: entry.slug,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await rm(operationRoot, { recursive: true, force: true });
    }
  }
  return result;
};

export const importMediaBatch = async (
  options: BatchImportOptions,
  adapters: BatchImportAdapters = {},
): Promise<BatchImportResult> => {
  const manifest = await loadBatchManifest(options.manifest);
  const plan = await planBatchImport(
    {
      source: options.source,
      manifest,
      projectRoot: options.projectRoot,
      mediaRoot: options.mediaRoot,
      status: options.status,
    },
    adapters,
  );
  if (options.dryRun) return emptyResult(plan, true);
  return executeBatchImport(plan, options.quality, adapters);
};

export const formatBatchImportResult = (result: BatchImportResult): string => {
  const creates = result.plan.entries.filter((entry) => entry.state === "create").length;
  const replacements = result.plan.entries.filter((entry) => entry.state === "replace").length;
  const lines = [
    result.dryRun ? "Batch import dry run:" : "Batch import complete:",
    `  Create: ${creates} | Replace: ${replacements} | Already complete: ${result.alreadyComplete}`,
  ];
  if (result.dryRun) {
    for (const entry of result.plan.entries) {
      if (entry.state === "already-complete") {
        lines.push(`  ALREADY COMPLETE ${entry.slug}`);
        continue;
      }
      const action = entry.state.toUpperCase();
      if (entry.manifest.type === "image-set") {
        lines.push(`  ${action} ${entry.slug}: ${entry.pages.length} images`);
      } else {
        const counts = entry.manifest.chapters
          .map((chapter) => `chapter ${chapter.number} = ${entry.chapterPages.get(chapter.number)?.length ?? 0} pages`)
          .join(", ");
        lines.push(`  ${action} ${entry.slug}: ${counts}`);
      }
      for (const destination of entry.destinations) lines.push(`    -> ${destination}`);
      if (entry.ignored.length > 0) lines.push(`    Ignored: ${entry.ignored.join(", ")}`);
    }
  }
  if (!result.dryRun) {
    lines.push(`  Created: ${result.created} | Replaced: ${result.replaced} | Failed: ${result.failed.length}`);
    lines.push(`  Converted: ${result.converted} | Copied: ${result.copied} | Ignored: ${result.ignored}`);
  }
  for (const archive of result.plan.unlistedArchives) lines.push(`  Unlisted, not imported: ${archive}`);
  for (const failure of result.failed) lines.push(`  FAILED ${failure.slug}: ${failure.message}`);
  for (const quarantine of result.quarantines) lines.push(`  Quarantine: ${quarantine}`);
  return lines.join("\n");
};
