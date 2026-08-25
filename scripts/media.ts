import {
  addHelp,
  mediaHelp,
  optimizeHelp,
  parseAddArgs,
  parseMediaCommand,
  parseOptimizeArgs,
  parseRemoveArgs,
  parseSyncArgs,
  parseThumbnailArgs,
  parseValidateArgs,
  removeHelp,
  thumbnailHelp,
} from "../src/lib/media/cli";
import {
  requireMediaPort,
  requireMediaRoot,
  requireMediaSyncTarget,
} from "../src/lib/media/config";
import {
  exitCodeForMediaError,
  mediaExitCodes,
  MediaError,
} from "../src/lib/media/errors";
import { loadMediaContentEntries } from "../src/lib/media/content-source";
import {
  optimizeMedia,
  optimizeMediaInPlace,
  type OptimizeResult,
} from "../src/lib/media/optimizer";
import { importMangaVolumes } from "../src/lib/media/manga-volume";
import {
  formatBatchImportResult,
  importMediaBatch,
} from "../src/lib/media/batch-import";
import {
  executeMangaChapterUnavailable,
  planMangaChapterUnavailable,
} from "../src/lib/media/manga-remove";
import { collectManagedMediaReferences } from "../src/lib/media/references";
import {
  collectDoujinshiThumbnailItems,
  generateDoujinshiThumbnails,
} from "../src/lib/media/doujinshi-thumbnails";
import { createBunMediaFetch } from "../src/lib/media/server";
import {
  confirmPrune,
  formatPruneManifest,
  syncMedia,
} from "../src/lib/media/sync";
import {
  formatMediaValidationReport,
  validateMedia,
} from "../src/lib/media/validator";

const serve = (args: string[]): void => {
  if (args.length > 0)
    throw new MediaError(
      "usage",
      "The serve command does not accept arguments.",
    );

  const root = requireMediaRoot();
  const port = requireMediaPort();
  const server = Bun.serve({
    fetch: createBunMediaFetch(root),
    hostname: "127.0.0.1",
    port,
  });

  console.log(
    `Serving external media from ${root} at http://127.0.0.1:${server.port}`,
  );
  console.log("Public routes: /manga/* and /media/images/*");
};

const optimize = async (args: string[]): Promise<void> => {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(optimizeHelp);
    return;
  }
  const options = parseOptimizeArgs(args);
  const showPreparedReplacement = async (
    result: OptimizeResult,
  ): Promise<boolean> => {
    console.log("Web-reader replacement prepared and verified:");
    console.log(`  Resized: ${result.resized ?? 0}`);
    console.log(`  Original bytes: ${result.originalBytes}`);
    console.log(`  Optimized bytes: ${result.optimizedBytes}`);
    console.log(`  Saved bytes: ${result.savedBytes}`);
    return confirmPrune("Type yes to replace the managed files:");
  };
  const result = options.inPlace
    ? await optimizeMediaInPlace({
        source: options.source,
        profile: options.profile,
        quality: options.quality,
        dryRun: options.dryRun,
        webReader: true,
        confirm: showPreparedReplacement,
      })
    : await optimizeMedia({
        source: options.source,
        destination: options.destination!,
        profile: options.profile,
        quality: options.quality,
        dryRun: options.dryRun,
        webReader: options.webReader,
      });
  if (options.dryRun) {
    console.log("Media optimization dry run:");
    for (const item of result.plan.items) {
      const resize = item.resizeWidth ? ` [resize to ${item.resizeWidth}px]` : "";
      console.log(`  ${item.sourceRelativePath} -> ${item.outputRelativePath}${resize}`);
    }
    return;
  }

  if (options.inPlace && "applied" in result && !result.applied) {
    console.log("Media optimization cancelled; managed files were not changed.");
    return;
  }

  console.log("Media optimization complete:");
  console.log(`  Converted: ${result.converted}`);
  console.log(`  Copied: ${result.copied}`);
  console.log(`  Resized: ${result.resized ?? 0}`);
  console.log(`  Ignored: ${result.ignored}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  Original bytes: ${result.originalBytes}`);
  console.log(`  Optimized bytes: ${result.optimizedBytes}`);
  console.log(`  Saved bytes: ${result.savedBytes}`);
};

const add = async (args: string[]): Promise<void> => {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(addHelp);
    return;
  }
  const options = parseAddArgs(args);
  if (options.kind === "batch") {
    const result = await importMediaBatch({
      ...options,
      projectRoot: process.cwd(),
      mediaRoot: requireMediaRoot(),
    });
    console.log(formatBatchImportResult(result));
    if (result.failed.length > 0) {
      process.exitCode = mediaExitCodes.optimization;
    }
    return;
  }
  const result = await importMangaVolumes({
    ...options,
    projectRoot: process.cwd(),
    mediaRoot: requireMediaRoot(),
  });
  console.log(`Imported ${result.chapters.length} ${options.status} manga chapters:`);
  for (const chapter of result.chapters) {
    console.log(`  Chapter ${chapter.number}: ${chapter.pageCount} pages`);
  }
};

const remove = async (args: string[]): Promise<void> => {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(removeHelp);
    return;
  }
  const options = parseRemoveArgs(args);
  const plan = await planMangaChapterUnavailable({
    ...options,
    projectRoot: process.cwd(),
    mediaRoot: requireMediaRoot(),
  });
  console.log(`Chapter: ${options.series} ${options.chapter}`);
  console.log(`Remove: ${plan.fileCount} files (${plan.totalBytes} bytes)`);
  console.log(`From: ${plan.mediaPath}`);
  console.log("Keep entry as: Currently unavailable");
  if (!(await confirmPrune("Type yes to continue:"))) {
    console.log("Removal cancelled; nothing changed.");
    return;
  }
  await executeMangaChapterUnavailable(plan);
  console.log("Chapter media removed; published entry is currently unavailable.");
};

const thumbnails = async (args: string[]): Promise<void> => {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(thumbnailHelp);
    return;
  }
  const options = parseThumbnailArgs(args);
  const root = requireMediaRoot();
  try {
    const entries = await loadMediaContentEntries(process.cwd());
    const items = collectDoujinshiThumbnailItems(entries, root, options.series);
    const result = await generateDoujinshiThumbnails({
      items,
      dryRun: options.dryRun,
      force: options.force,
    });
    console.log(options.dryRun ? "Doujinshi thumbnail dry run:" : "Doujinshi thumbnails complete:");
    console.log(`  Selected pages: ${items.length}`);
    if (options.dryRun) {
      for (const item of result.plan) {
        console.log(
          `  ${item.action === "generate" ? "GENERATE" : "SKIP"} ${item.sourcePublicPath} -> ${item.destinationPublicPath} [${item.reason}]`,
        );
      }
    }
    console.log(`  Generated: ${result.generated} | Skipped: ${result.skipped} | Failed: ${result.failed.length}`);
    for (const failure of result.failed) {
      console.log(`  FAILED ${failure.item.sourcePublicPath}: ${failure.message}`);
    }
    if (result.failed.length > 0) process.exitCode = mediaExitCodes.optimization;
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "optimization",
      error instanceof Error ? error.message : String(error),
    );
  }
};

const validate = async (args: string[]): Promise<void> => {
  parseValidateArgs(args);
  const root = requireMediaRoot();
  try {
    const entries = await loadMediaContentEntries(process.cwd());
    const references = collectManagedMediaReferences(entries);
    const report = await validateMedia({ root, references });
    console.log(formatMediaValidationReport(report));
    if (report.errors.length > 0) {
      process.exitCode = mediaExitCodes.validation;
    }
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "validation",
      error instanceof Error ? error.message : String(error),
    );
  }
};

const sync = async (args: string[]): Promise<void> => {
  const options = parseSyncArgs(args);
  const root = requireMediaRoot();
  let report;
  try {
    const entries = await loadMediaContentEntries(process.cwd());
    const references = collectManagedMediaReferences(entries);
    report = await validateMedia({ root, references });
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "validation",
      error instanceof Error ? error.message : String(error),
    );
  }

  console.log(formatMediaValidationReport(report));
  if (report.errors.length > 0) {
    process.exitCode = mediaExitCodes.validation;
    return;
  }

  const target = requireMediaSyncTarget();
  try {
    const result = await syncMedia({
      root,
      target,
      dryRun: options.dryRun,
      prune: options.prune,
      onManifest: (manifest) => console.log(formatPruneManifest(manifest)),
    });
    if (!options.prune) {
      console.log(
        options.dryRun
          ? "Media synchronization dry run complete; no remote files changed."
          : "Media synchronization complete; no remote files were deleted.",
      );
    } else if (options.dryRun) {
      console.log("Prune dry run complete; no remote files changed.");
    } else if (result.manifest?.files.length === 0) {
      console.log("Synchronization complete; there is nothing to prune.");
    } else if (result.pruned) {
      console.log("Synchronization and confirmed remote pruning complete.");
    } else {
      console.log("Synchronization complete; remote pruning was declined.");
    }
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "synchronization",
      error instanceof Error ? error.message : String(error),
    );
  }
};

const run = async (): Promise<void> => {
  const argv = Bun.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    console.log(mediaHelp);
    return;
  }

  const { command, args } = parseMediaCommand(argv);
  if (command === "serve") {
    serve(args);
    return;
  }

  if (command === "optimize") {
    await optimize(args);
    return;
  }

  if (command === "add") {
    await add(args);
    return;
  }

  if (command === "remove") {
    await remove(args);
    return;
  }

  if (command === "thumbnails") {
    await thumbnails(args);
    return;
  }

  if (command === "validate") {
    await validate(args);
    return;
  }

  if (command === "sync") {
    await sync(args);
    return;
  }

  throw new MediaError(
    "usage",
    `The media:${command} command is not available until its implementation plan is complete.`,
  );
};

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Media command failed: ${message}`);
  process.exitCode = exitCodeForMediaError(error);
}
