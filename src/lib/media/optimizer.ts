import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  cleanupOwnedDirectory,
  createOwnedDirectoryAt,
  type DirectoryCapability,
  extractZipArchive,
  listZipEntries,
  type OwnedDirectory,
  publishOwnedDirectory,
  publishStagedZipDirectory,
  readZipEntryHeader,
  releaseDirectoryCapability,
  releaseOwnedDirectory,
  retainDirectoryCapability,
} from "./archive";
import { MediaError } from "./errors";
import {
  createImageCommand,
  detectImageFormat,
  detectImageFormatFromBytes,
  type ImageFormat,
  verifyWebp,
} from "./image-format";
import { type CommandRunner, requireTool, runCommand } from "./process";

export type OptimizerProfile = "reader" | "gallery";

export type OptimizationSource = {
  path: string;
  format: ImageFormat;
  bytes: number;
};

export type OptimizationItem = {
  sourcePath: string;
  sourceRelativePath: string;
  outputRelativePath: string;
  format: Exclude<ImageFormat, "avif" | "unknown">;
  action: "convert" | "copy";
  bytes: number;
};

export type OptimizationPlan = {
  source: string;
  destination: string;
  profile: OptimizerProfile;
  quality: number;
  items: OptimizationItem[];
  ignored: string[];
  originalBytes: number;
};

export type OptimizeOptions = {
  source: string;
  destination: string;
  profile: OptimizerProfile;
  quality: number;
  dryRun: boolean;
};

export type OptimizeResult = {
  plan: OptimizationPlan;
  converted: number;
  copied: number;
  ignored: number;
  failed: number;
  originalBytes: number;
  optimizedBytes: number;
  savedBytes: number;
};

export type OptimizeAdapters = {
  runner?: CommandRunner;
  which?: (name: string) => string | null;
  verifyOutput?: (path: string, runner?: CommandRunner) => Promise<void>;
  beforePinnedPublish?: () => void;
};

export type PlanMediaOptimizationAdapters = {
  inspectSource: (source: string) => Promise<OptimizationSource[]>;
  pathExists: (path: string) => Promise<boolean>;
  /** The inspected source is one file, so its execution path is `options.source`. */
  sourceIsFile?: boolean;
};

type AcceptedSource = {
  source: OptimizationSource;
  sourcePath: string;
  sourceRelativePath: string;
  format: Exclude<ImageFormat, "avif" | "unknown">;
};

const naturalPathCollator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});

const supportedFormats = new Set<Exclude<ImageFormat, "avif" | "unknown">>([
  "jpeg",
  "png",
  "gif",
  "webp",
]);

const normalizeMediaSeparators = (path: string): string =>
  path.replaceAll("\\", "/");

const pathName = (path: string): string => {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
};

const parentPath = (path: string): string => {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
};

const normalizeRelativePath = (path: string): string => {
  const segments = normalizeMediaSeparators(path).split("/");
  if (segments.some((segment) => segment === "..")) {
    throw new Error(`Unsafe media source path: ${path}`);
  }

  const normalized = segments.filter((segment) => segment !== "" && segment !== ".").join("/");
  if (normalized.length === 0) throw new Error(`Invalid media source path: ${path}`);
  return normalized;
};

const relativeSourcePath = (sourceRoot: string, sourcePath: string): string => {
  const path = isAbsolute(sourcePath) ? relative(sourceRoot, sourcePath) : sourcePath;
  return normalizeRelativePath(path || pathName(normalizeMediaSeparators(sourcePath)));
};

const portableOutputKey = (path: string): string =>
  normalizeMediaSeparators(path).normalize("NFC").toLowerCase();

const sortNatural = <T>(values: T[], valuePath: (value: T) => string): T[] =>
  [...values].sort((left, right) => {
    const leftPath = normalizeMediaSeparators(valuePath(left));
    const rightPath = normalizeMediaSeparators(valuePath(right));
    return naturalPathCollator.compare(leftPath, rightPath) || (leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0);
  });

const outputPathForGallerySource = (sourceRelativePath: string): string => {
  const parent = parentPath(sourceRelativePath);
  const name = pathName(sourceRelativePath);
  const extension = name.lastIndexOf(".");
  const basename = extension > 0 ? name.slice(0, extension) : name;
  return `${parent ? `${parent}/` : ""}${basename}.webp`;
};

const readerRelativePaths = (sources: AcceptedSource[]): string[] => {
  const segments = sources.map((source) => source.sourceRelativePath.split("/"));
  const commonWrapper =
    segments.every((path) => path.length > 1) &&
    segments.every((path) => path[0] === segments[0]?.[0]);
  const paths = commonWrapper
    ? segments.map((path) => path.slice(1).join("/"))
    : sources.map((source) => source.sourceRelativePath);
  const directories = new Set(paths.map(parentPath));

  if (directories.size > 1) {
    throw new Error(
      `Reader source has multiple reader directories: ${naturalSortMediaPaths([...directories]).join(", ")}`,
    );
  }
  return paths;
};

const acceptedFormat = (
  source: OptimizationSource,
  sourceRelativePath: string,
): Exclude<ImageFormat, "avif" | "unknown"> => {
  if (source.format === "avif") {
    throw new Error(`AVIF input is recognized but unsupported: ${sourceRelativePath}`);
  }
  if (source.format === "unknown") {
    throw new Error(`Unknown or unsupported image input: ${sourceRelativePath}`);
  }
  if (!supportedFormats.has(source.format)) {
    throw new Error(`Unsupported image input: ${sourceRelativePath}`);
  }
  return source.format;
};

export const isIgnoredMediaJunk = (path: string): boolean => {
  const segments = normalizeMediaSeparators(path).split("/");
  const name = segments.at(-1)?.toLowerCase();
  return (
    segments.some((segment) => segment.toLowerCase() === "__macosx") ||
    name === ".ds_store" ||
    name === "thumbs.db" ||
    name === "desktop.ini" ||
    name === "icon\r" ||
    name?.startsWith("._") === true
  );
};

export const naturalSortMediaPaths = (paths: string[]): string[] =>
  sortNatural(paths, (path) => path);

export const createReaderOutputName = (index: number): string =>
  `${String(index).padStart(3, "0")}.webp`;

export const planMediaOptimization = async (
  options: OptimizeOptions,
  adapters?: PlanMediaOptimizationAdapters,
): Promise<OptimizationPlan> => {
  const inspectSource = adapters?.inspectSource;
  const pathExists = adapters?.pathExists;
  if (!inspectSource) throw new Error("Source inspection adapter is required.");
  if (!pathExists) throw new Error("Destination existence adapter is required.");

  if (await pathExists(options.destination)) {
    throw new Error(`Optimization destination already exists: ${options.destination}`);
  }

  const ignored: string[] = [];
  const accepted: AcceptedSource[] = [];
  for (const source of sortNatural(await inspectSource(options.source), (item) => item.path)) {
    const sourceRelativePath = relativeSourcePath(options.source, source.path);
    if (isIgnoredMediaJunk(sourceRelativePath)) {
      ignored.push(sourceRelativePath);
      continue;
    }

    const format = acceptedFormat(source, sourceRelativePath);
    accepted.push({
      source,
      sourcePath: adapters.sourceIsFile
        ? options.source
        : isAbsolute(source.path)
        ? source.path
        : join(options.source, sourceRelativePath),
      sourceRelativePath,
      format,
    });
  }

  if (accepted.length === 0) throw new Error("Source contains no accepted media files.");

  const outputPaths =
    options.profile === "reader"
      ? readerRelativePaths(accepted)
      : accepted.map((source) => source.sourceRelativePath);
  const ordered = sortNatural(
    accepted.map((source, index) => ({ source, outputPath: outputPaths[index]! })),
    ({ outputPath }) => outputPath,
  );
  const items = ordered.map(({ source, outputPath }, index): OptimizationItem => ({
    sourcePath: source.sourcePath,
    sourceRelativePath: outputPath,
    outputRelativePath:
      options.profile === "reader"
        ? createReaderOutputName(index + 1)
        : outputPathForGallerySource(outputPath),
    format: source.format,
    action: source.format === "webp" ? "copy" : "convert",
    bytes: source.source.bytes,
  }));

  const collisions = new Map<string, OptimizationItem>();
  for (const item of items) {
    const key = portableOutputKey(item.outputRelativePath);
    const prior = collisions.get(key);
    if (prior) {
      throw new Error(
        `Gallery output collision: ${prior.sourceRelativePath} and ${item.sourceRelativePath} both map to ${item.outputRelativePath}`,
      );
    }
    collisions.set(key, item);
  }

  return {
    source: options.source,
    destination: options.destination,
    profile: options.profile,
    quality: options.quality,
    items,
    ignored,
    originalBytes: items.reduce((total, item) => total + item.bytes, 0),
  };
};

type SourceInspection = {
  kind: "file" | "directory" | "archive";
  sources: OptimizationSource[];
};

type PathIdentity = { device: number; inode: number };

const hasErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
};

const isPathInside = (root: string, candidate: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot !== "" &&
    pathFromRoot !== ".." &&
    !pathFromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromRoot)
  );
};

const zipSignatures = new Set([0x04034b50, 0x05054b50, 0x06054b50, 0x08074b50]);

const isZipArchive = async (path: string): Promise<boolean> => {
  const bytes = new Uint8Array(await Bun.file(path).slice(0, 4).arrayBuffer());
  if (bytes.byteLength < 4) return false;
  return zipSignatures.has(
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      0,
      true,
    ),
  );
};

const inspectDirectory = async (
  source: string,
): Promise<OptimizationSource[]> => {
  const sources: OptimizationSource[] = [];

  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(
          `Unsupported media source entry: ${relative(source, path)}`,
        );
      }

      const info = await stat(path);
      const sourceRelativePath = relative(source, path);
      sources.push({
        path,
        format: isIgnoredMediaJunk(sourceRelativePath)
          ? "unknown"
          : await detectImageFormat(path),
        bytes: info.size,
      });
    }
  };

  await walk(source);
  return sources;
};

const inspectArchive = async (
  source: string,
  runner: CommandRunner,
): Promise<OptimizationSource[]> => {
  const entries = await listZipEntries(source, runner);
  const sources: OptimizationSource[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    sources.push({
      path: entry.path,
      format: isIgnoredMediaJunk(entry.path)
        ? "unknown"
        : detectImageFormatFromBytes(await readZipEntryHeader(source, entry)),
      bytes: 0,
    });
  }
  return sources;
};

const inspectConcreteSource = async (
  source: string,
  sourceInfo: Stats,
  runner: CommandRunner,
): Promise<SourceInspection> => {
  if (sourceInfo.isDirectory()) {
    return { kind: "directory", sources: await inspectDirectory(source) };
  }
  if (!sourceInfo.isFile()) {
    throw new Error(
      `Optimization source is not a regular file or directory: ${source}`,
    );
  }
  if (await isZipArchive(source)) {
    return {
      kind: "archive",
      sources: await inspectArchive(source, runner),
    };
  }

  return {
    kind: "file",
    sources: [
      {
        path: basename(source),
        format: await detectImageFormat(source),
        bytes: sourceInfo.size,
      },
    ],
  };
};

const createStagingDirectory = (
  destination: string,
  parent: DirectoryCapability,
): OwnedDirectory =>
  createOwnedDirectoryAt(
    parent,
    `.${basename(destination)}.media-staging-${randomUUID()}`,
  );

const pathIdentity = (info: Stats): PathIdentity => ({
  device: info.dev,
  inode: info.ino,
});

const samePathIdentity = (
  info: Stats,
  identity: PathIdentity,
): boolean => info.dev === identity.device && info.ino === identity.inode;

const dryRunResult = (plan: OptimizationPlan): OptimizeResult => ({
  plan,
  converted: 0,
  copied: 0,
  ignored: plan.ignored.length,
  failed: 0,
  originalBytes: plan.originalBytes,
  optimizedBytes: 0,
  savedBytes: 0,
});

const requireOptimizationTools = (
  plan: OptimizationPlan,
  archiveSource: boolean,
  which: NonNullable<OptimizeAdapters["which"]>,
): void => {
  if (archiveSource) requireTool("unzip", which);
  if (
    plan.items.some((item) => item.format === "jpeg" || item.format === "png")
  ) {
    requireTool("cwebp", which);
  }
  if (plan.items.some((item) => item.format === "gif")) {
    requireTool("gif2webp", which);
  }
  requireTool("webpinfo", which);
};

const archiveExecutionPath = (
  source: string,
  extraction: string,
  item: OptimizationItem,
): string => join(extraction, relative(source, item.sourcePath));

const updateArchiveByteAccounting = async (
  plan: OptimizationPlan,
  source: string,
  extraction: string,
): Promise<OptimizationPlan> => {
  const items = await Promise.all(
    plan.items.map(async (item) => ({
      ...item,
      bytes: (await stat(archiveExecutionPath(source, extraction, item))).size,
    })),
  );
  return {
    ...plan,
    items,
    originalBytes: items.reduce((total, item) => total + item.bytes, 0),
  };
};

export const optimizeMedia = async (
  options: OptimizeOptions,
  adapters: OptimizeAdapters = {},
): Promise<OptimizeResult> => {
  const requestedSource = resolve(options.source);
  const requestedDestination = resolve(options.destination);
  const requestedDestinationParent = dirname(requestedDestination);
  const runner = adapters.runner ?? runCommand;
  const which = adapters.which ?? Bun.which;
  const verifyOutput = adapters.verifyOutput ?? verifyWebp;
  let staging: OwnedDirectory | undefined;
  let extraction: OwnedDirectory | undefined;
  let published: OwnedDirectory | undefined;
  let destinationParentCapability: DirectoryCapability | undefined;

  try {
    let sourceInfo: Stats;
    try {
      sourceInfo = await lstat(requestedSource);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) {
        throw new Error(
          `Optimization source does not exist: ${requestedSource}`,
        );
      }
      throw error;
    }
    if (!sourceInfo.isDirectory() && !sourceInfo.isFile()) {
      throw new Error(
        `Optimization source is not a regular file or directory: ${requestedSource}`,
      );
    }

    if (await pathExists(requestedDestination)) {
      throw new Error(
        `Optimization destination already exists: ${requestedDestination}`,
      );
    }

    const canonicalSource = await realpath(requestedSource);
    const canonicalSourceInfo = await lstat(canonicalSource);
    if (!samePathIdentity(canonicalSourceInfo, pathIdentity(sourceInfo))) {
      throw new Error(
        `Optimization source changed during validation: ${requestedSource}`,
      );
    }
    sourceInfo = canonicalSourceInfo;

    let destinationParent: string;
    try {
      destinationParent = await realpath(requestedDestinationParent);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) {
        throw new Error(
          `Optimization destination parent does not exist: ${requestedDestinationParent}`,
        );
      }
      throw error;
    }
    let parentInfo: Stats;
    try {
      parentInfo = await lstat(destinationParent);
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) {
        throw new Error(
          `Optimization destination parent does not exist: ${destinationParent}`,
        );
      }
      throw error;
    }
    if (!parentInfo.isDirectory()) {
      throw new Error(
        `Optimization destination parent is not a directory: ${destinationParent}`,
      );
    }
    const parentIdentity = pathIdentity(parentInfo);
    destinationParentCapability = retainDirectoryCapability(destinationParent);
    if (
      destinationParentCapability.device !== parentIdentity.device ||
      destinationParentCapability.inode !== parentIdentity.inode
    ) {
      throw new Error(
        `Optimization destination parent changed during execution: ${destinationParent}`,
      );
    }
    const destination = join(
      destinationParent,
      basename(requestedDestination),
    );
    if (await pathExists(destination)) {
      throw new Error(
        `Optimization destination already exists: ${requestedDestination}`,
      );
    }
    if (
      sourceInfo.isDirectory() &&
      isPathInside(canonicalSource, destination)
    ) {
      throw new Error(
        `Optimization destination cannot be inside the source directory: ${destination}`,
      );
    }

    const source = requestedSource;
    const inspection = await inspectConcreteSource(source, sourceInfo, runner);
    let plan = await planMediaOptimization(
      { ...options, source, destination },
      {
        inspectSource: async () => inspection.sources,
        pathExists: async () => false,
        sourceIsFile: inspection.kind === "file",
      },
    );

    if (options.dryRun) {
      releaseDirectoryCapability(destinationParentCapability);
      destinationParentCapability = undefined;
      return dryRunResult(plan);
    }

    const archiveSource = inspection.kind === "archive";
    requireOptimizationTools(plan, archiveSource, which);

    staging = createStagingDirectory(
      destination,
      destinationParentCapability,
    );

    if (archiveSource) {
      const extractionPath = join(
        destinationParent,
        `.${basename(destination)}.media-extraction-${randomUUID()}`,
      );
      try {
        await extractZipArchive(
          source,
          extractionPath,
          runner,
          publishStagedZipDirectory,
          (owned) => {
            extraction = owned;
          },
          destinationParentCapability,
        );
        if (!extraction) {
          throw new Error("Archive extraction ownership was not retained.");
        }
        plan = await updateArchiveByteAccounting(plan, source, extractionPath);
      } catch (error) {
        throw new Error(
          `Unable to extract archive "${source}": ${errorMessage(error)}`,
        );
      }
    }

    const stagedOutputs = plan.items.map((item) => ({
      item,
      sourcePath:
        inspection.kind === "archive"
          ? archiveExecutionPath(source, extraction!.path, item)
          : item.sourcePath,
      outputPath: join(staging!.path, item.outputRelativePath),
    }));

    for (const output of stagedOutputs) {
      await mkdir(dirname(output.outputPath), { recursive: true });
    }

    let converted = 0;
    let copied = 0;
    for (const output of stagedOutputs) {
      try {
        if (output.item.action === "copy") {
          await copyFile(output.sourcePath, output.outputPath);
          copied += 1;
          continue;
        }

        const command = createImageCommand({
          format: output.item.format,
          source: output.sourcePath,
          destination: output.outputPath,
          quality: plan.quality,
        });
        if (!command) {
          throw new Error("No conversion command was produced.");
        }
        const result = await runner(command);
        if (result.exitCode !== 0) {
          throw new Error(
            `${command[0]} exited with code ${result.exitCode}${
              result.stderr.trim() ? `: ${result.stderr.trim()}` : ""
            }`,
          );
        }
        converted += 1;
      } catch (error) {
        throw new Error(
          `Unable to optimize "${output.item.sourceRelativePath}": ${errorMessage(error)}`,
        );
      }
    }

    let optimizedBytes = 0;
    for (const output of stagedOutputs) {
      try {
        await verifyOutput(output.outputPath, runner);
        optimizedBytes += (await stat(output.outputPath)).size;
      } catch (error) {
        throw new Error(
          `Unable to verify output "${output.item.outputRelativePath}" for "${output.item.sourceRelativePath}": ${errorMessage(error)}`,
        );
      }
    }

    publishOwnedDirectory(staging, destination, {
      beforePinnedPublish: adapters.beforePinnedPublish,
    });
    published = staging;
    staging = undefined;

    if (extraction) cleanupOwnedDirectory(extraction);
    extraction = undefined;
    releaseOwnedDirectory(published);
    published = undefined;
    releaseDirectoryCapability(destinationParentCapability);
    destinationParentCapability = undefined;

    return {
      plan,
      converted,
      copied,
      ignored: plan.ignored.length,
      failed: 0,
      originalBytes: plan.originalBytes,
      optimizedBytes,
      savedBytes: plan.originalBytes - optimizedBytes,
    };
  } catch (error) {
    const cleanupErrors: unknown[] = [];
    for (const owned of [extraction, staging, published]) {
      if (!owned) continue;
      try {
        cleanupOwnedDirectory(owned);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (destinationParentCapability) {
      releaseDirectoryCapability(destinationParentCapability);
      destinationParentCapability = undefined;
    }
    const failure =
      cleanupErrors.length === 0
        ? error
        : new AggregateError(
            [error, ...cleanupErrors],
            `${errorMessage(error)} Temporary media cleanup also failed: ${cleanupErrors.map(errorMessage).join("; ")}`,
          );
    if (failure instanceof MediaError) throw failure;
    throw new MediaError("optimization", errorMessage(failure));
  }
};
