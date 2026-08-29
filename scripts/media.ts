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
import { optimizeVideoManifest } from "../src/lib/media/video-optimizer";
import {
  formatBytes,
  formatStatus,
  formatSummary,
} from "../src/lib/media/terminal";
import { extractTerminalOptions } from "../src/lib/terminal/format";
import { TerminalSession } from "../src/lib/terminal/session";
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
  collectMediaThumbnailItems,
  generateDoujinshiThumbnails,
  pruneMediaThumbnails,
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

let session: TerminalSession | undefined;
let plainOutput = false;

const interrupt = (): never => {
  session?.dispose();
  process.stderr.write("\n! Media command interrupted; verified existing files were left in place.\n");
  process.exit(130);
};

process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

const startSession = (command: string, title?: string): TerminalSession => {
  session = new TerminalSession({
    scope: "media",
    command,
    plain: plainOutput,
    errorOutput: (text) => process.stderr.write(text),
  });
  session.start(title ? { title } : {});
  return session;
};

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

  const terminal = startSession("serve", "Managed media server");
  terminal.complete("Media server ready", [
    ["Address", `http://127.0.0.1:${server.port}`],
    ["Media root", root],
    ["Routes", "/manga/* · /media/images/* · /media/anime/*"],
  ]);
};

const optimize = async (args: string[]): Promise<void> => {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(optimizeHelp);
    return;
  }
  const options = parseOptimizeArgs(args);
  const terminal = startSession(
    options.kind === "video" ? "optimize video" : "optimize",
    options.kind === "video" ? "Manifest-driven WebM optimization" : "Managed media optimization",
  );
  let progress: ReturnType<TerminalSession["progress"]> | undefined;
  let progressStarted = false;
  const reportProgress = (update: {
    current: string;
    completed: number;
    total: number;
    detail: string;
    filePercent?: number;
    processedSeconds?: number;
  }): void => {
    if (!progressStarted) {
      progressStarted = true;
      progress = terminal.progress();
      progress.start(options.kind === "video" ? "Converting videos" : "Optimizing media", update.total);
    }
    progress!.update(update);
  };
  terminal.phase(options.kind === "video" ? "Inspecting sources and existing outputs" : "Inspecting source media");
  if (options.kind === "video") {
    const result = await optimizeVideoManifest({
      sourceRoot: options.sourceRoot,
      manifestPath: options.manifest,
      mediaRoot: requireMediaRoot(),
      dryRun: options.dryRun,
      resume: options.resume,
      onProgress: reportProgress,
    });
    if (progressStarted) progress!.finish(options.dryRun ? "planned" : "complete");
    else terminal.phaseDone(`${result.items.length} variants · ${result.reused} reused`);
    for (const item of result.items) {
      console.log(`  ${item.action.toUpperCase()} ${item.label}: ${item.sourcePath} -> ${item.outputPublicPath}`);
    }
    terminal.complete(options.dryRun ? "Video optimization dry run complete" : "Video optimization complete", [
      ["Files", result.items.length],
      ["Reused", result.reused],
      ["Created", result.created],
      ["Remaining", result.items.length - result.reused - result.created],
      ["Original", formatBytes(result.originalBytes)],
      ["Output", formatBytes(result.outputBytes)],
      ...(result.operationRecord ? [["Operation record", result.operationRecord] as [string, string]] : []),
    ]);
    return;
  }
  const showPreparedReplacement = async (
    result: OptimizeResult,
  ): Promise<boolean> => {
    console.log(formatStatus("Web-reader replacement prepared and verified", "success"));
    console.log(formatSummary([
      ["Resized", result.resized ?? 0],
      ["Original", formatBytes(result.originalBytes)],
      ["Optimized", formatBytes(result.optimizedBytes)],
      ["Saved", formatBytes(result.savedBytes)],
    ]));
    return confirmPrune("Type yes to replace the managed files:");
  };
  const result = options.inPlace
    ? await optimizeMediaInPlace({
        source: options.source,
        profile: options.profile,
        quality: options.quality,
        dryRun: options.dryRun,
        webReader: true,
        onProgress: reportProgress,
        confirm: showPreparedReplacement,
      })
    : await optimizeMedia({
        source: options.source,
        destination: options.destination!,
        profile: options.profile,
        quality: options.quality,
        dryRun: options.dryRun,
        webReader: options.webReader,
        onProgress: reportProgress,
      });
  if (progressStarted) progress!.finish(options.dryRun ? "planned" : "complete");
  else terminal.phaseDone(`${result.plan.items.length} files planned`);
  if (options.dryRun) {
    for (const item of result.plan.items) {
      const resize = item.resizeWidth ? ` [resize to ${item.resizeWidth}px]` : "";
      console.log(`  ${item.sourceRelativePath} -> ${item.outputRelativePath}${resize}`);
    }
    terminal.complete("Media optimization dry run complete", [
      ["Files", result.plan.items.length],
      ["Original", formatBytes(result.originalBytes)],
    ]);
    return;
  }

  if (options.inPlace && "applied" in result && !result.applied) {
    terminal.status("Media optimization cancelled; managed files were not changed.", "warning");
    return;
  }

  terminal.complete("Media optimization complete", [
    ["Converted", result.converted], ["Copied", result.copied],
    ["Resized", result.resized ?? 0], ["Ignored", result.ignored], ["Failed", result.failed],
    ["Original", formatBytes(result.originalBytes)], ["Optimized", formatBytes(result.optimizedBytes)],
    ["Saved", formatBytes(result.savedBytes)],
  ]);
};

const add = async (args: string[]): Promise<void> => {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(addHelp);
    return;
  }
  const options = parseAddArgs(args);
  const terminal = startSession("add", options.kind === "batch" ? "Reviewed batch import" : "Manga volume import");
  terminal.phase("Inspecting and preparing media");
  if (options.kind === "batch") {
    const result = await importMediaBatch({
      ...options,
      projectRoot: process.cwd(),
      mediaRoot: requireMediaRoot(),
    });
    terminal.phaseDone(options.dryRun ? "plan ready" : "verified");
    terminal.status(options.dryRun ? "Batch import dry run" : "Batch import complete", options.dryRun ? "warning" : "success");
    console.log(formatBatchImportResult(result).split("\n").slice(1).join("\n"));
    if (result.failed.length > 0) {
      process.exitCode = mediaExitCodes.optimization;
    }
    terminal.complete(options.dryRun ? "Batch import preview complete" : "Batch import transaction complete");
    return;
  }
  const result = await importMangaVolumes({
    ...options,
    projectRoot: process.cwd(),
    mediaRoot: requireMediaRoot(),
  });
  terminal.phaseDone("verified");
  for (const chapter of result.chapters) {
    console.log(`  Chapter ${chapter.number}: ${chapter.pageCount} pages`);
  }
  terminal.complete(`Imported ${result.chapters.length} ${options.status} manga chapters`);
};

const remove = async (args: string[]): Promise<void> => {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(removeHelp);
    return;
  }
  const options = parseRemoveArgs(args);
  const terminal = startSession("remove", "Safe managed-media removal");
  terminal.phase("Resolving exact chapter media");
  const plan = await planMangaChapterUnavailable({
    ...options,
    projectRoot: process.cwd(),
    mediaRoot: requireMediaRoot(),
  });
  terminal.phaseDone(`${plan.fileCount} files resolved`);
  console.log(formatSummary([
    ["Chapter", `${options.series} ${options.chapter}`],
    ["Remove", `${plan.fileCount} files · ${formatBytes(plan.totalBytes)}`],
    ["From", plan.mediaPath],
    ["Keep entry as", "Currently unavailable"],
  ], { marker: "warning" }));
  if (!(await confirmPrune("Type yes to continue:"))) {
    terminal.status("Removal cancelled; nothing changed.", "warning");
    return;
  }
  await executeMangaChapterUnavailable(plan);
  terminal.complete("Chapter media removed; published entry is currently unavailable.");
};

const thumbnails = async (args: string[]): Promise<void> => {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(thumbnailHelp);
    return;
  }
  const options = parseThumbnailArgs(args);
  const terminal = startSession("thumbnails", "Managed preview thumbnails");
  const root = requireMediaRoot();
  try {
    terminal.phase("Inspecting thumbnail sources");
    const entries = await loadMediaContentEntries(process.cwd());
    const items = collectMediaThumbnailItems(entries, root, options.series);
    terminal.phaseDone(`${items.length} selected`);
    terminal.phase(options.dryRun ? "Planning thumbnail changes" : "Generating thumbnails");
    const result = await generateDoujinshiThumbnails({
      items,
      dryRun: options.dryRun,
      force: options.force,
    });
    const cleanup = result.failed.length === 0
      ? await pruneMediaThumbnails({ items, root, dryRun: options.dryRun })
      : { planned: [], removed: [] };
    terminal.phaseDone(options.dryRun ? "plan ready" : "verified");
    terminal.status(options.dryRun ? "Media thumbnail dry run" : "Media thumbnails complete", options.dryRun ? "warning" : "success");
    console.log(formatSummary([["Selected thumbnails", items.length]]));
    if (options.dryRun) {
      for (const item of result.plan) {
        console.log(
          `  ${item.action === "generate" ? "GENERATE" : "SKIP"} ${item.sourcePublicPath} -> ${item.destinationPublicPath} [${item.reason}]`,
        );
      }
      for (const path of cleanup.planned) console.log(`  PRUNE ${path}`);
    }
    console.log(formatSummary([
      ["Generated", result.generated], ["Skipped", result.skipped],
      ["Failed", result.failed.length], ["Pruned", cleanup.removed.length],
    ]));
    for (const failure of result.failed) {
      console.log(`  FAILED ${failure.item.sourcePublicPath}: ${failure.message}`);
    }
    if (result.failed.length > 0) process.exitCode = mediaExitCodes.optimization;
    if (result.failed.length === 0) terminal.complete(options.dryRun ? "Thumbnail preview complete" : "Thumbnail generation complete");
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
  const terminal = startSession("validate", "Managed media integrity");
  const root = requireMediaRoot();
  try {
    terminal.phase("Inspecting references and managed files");
    const entries = await loadMediaContentEntries(process.cwd());
    const references = collectManagedMediaReferences(entries);
    const report = await validateMedia({ root, references });
    terminal.phaseDone(`${references.length} references checked`);
    terminal.status(report.errors.length > 0 ? "Validation found errors" : "Media validation passed", report.errors.length > 0 ? "error" : "success");
    console.log(formatMediaValidationReport(report));
    if (report.errors.length > 0) {
      process.exitCode = mediaExitCodes.validation;
    } else {
      terminal.complete("Media validation complete");
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
  const terminal = startSession("sync", options.dryRun ? "Media synchronization preview" : "Managed media synchronization");
  const root = requireMediaRoot();
  let report;
  try {
    terminal.phase("Validating before synchronization");
    const entries = await loadMediaContentEntries(process.cwd());
    const references = collectManagedMediaReferences(entries);
    report = await validateMedia({ root, references });
    terminal.phaseDone(`${references.length} references checked`);
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "validation",
      error instanceof Error ? error.message : String(error),
    );
  }

  terminal.status("Validation passed; ready to synchronize", "success");
  console.log(formatMediaValidationReport(report));
  if (report.errors.length > 0) {
    process.exitCode = mediaExitCodes.validation;
    return;
  }

  const target = requireMediaSyncTarget();
  try {
    terminal.phase(options.dryRun ? "Calculating synchronization changes" : "Synchronizing managed media");
    const result = await syncMedia({
      root,
      target,
      dryRun: options.dryRun,
      prune: options.prune,
      onManifest: (manifest) => console.log(formatPruneManifest(manifest)),
    });
    terminal.phaseDone(options.dryRun ? "preview ready" : "transfer complete");
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
    terminal.complete(options.dryRun ? "Synchronization preview complete" : "Media synchronization complete");
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError(
      "synchronization",
      error instanceof Error ? error.message : String(error),
    );
  }
};

const run = async (): Promise<void> => {
  const terminal = extractTerminalOptions(Bun.argv.slice(2));
  const argv = terminal.args;
  plainOutput = terminal.plain;
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
  if (session) session.fail(`Media command failed: ${message}`);
  else console.error(formatStatus(`Media command failed: ${message}`, "error"));
  process.exitCode = exitCodeForMediaError(error);
}
