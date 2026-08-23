import { randomUUID } from "node:crypto";
import {
  constants,
  fstatSync,
  openSync,
  readSync,
  writeSync,
  type Stats,
} from "node:fs";
import { lstat, readdir, realpath, stat } from "node:fs/promises";
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
  releaseRetainedArchiveFile,
  releaseRetainedOutputFile,
  releaseDirectoryCapability,
  releaseOwnedDirectory,
  type RetainedArchiveFile,
  type RetainedOutputFile,
  retainOwnedArchiveFile,
  retainOwnedOutputFile,
  retainDirectoryCapability,
  sealOwnedDirectoryForRead,
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
  device?: number;
  inode?: number;
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
  platform?: NodeJS.Platform;
  verifyOutput?: (path: string, runner?: CommandRunner) => Promise<void>;
  beforePinnedPublish?: () => void;
  afterArchiveOwnershipTransfer?: (extractionPath: string) => void;
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

  const normalized = segments
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
  if (normalized.length === 0)
    throw new Error(`Invalid media source path: ${path}`);
  return normalized;
};

const relativeSourcePath = (sourceRoot: string, sourcePath: string): string => {
  const path = isAbsolute(sourcePath)
    ? relative(sourceRoot, sourcePath)
    : sourcePath;
  return normalizeRelativePath(
    path || pathName(normalizeMediaSeparators(sourcePath)),
  );
};

const portableOutputKey = (path: string): string =>
  normalizeMediaSeparators(path).normalize("NFC").toLowerCase();

const sortNatural = <T>(values: T[], valuePath: (value: T) => string): T[] =>
  [...values].sort((left, right) => {
    const leftPath = normalizeMediaSeparators(valuePath(left));
    const rightPath = normalizeMediaSeparators(valuePath(right));
    return (
      naturalPathCollator.compare(leftPath, rightPath) ||
      (leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0)
    );
  });

const outputPathForGallerySource = (sourceRelativePath: string): string => {
  const parent = parentPath(sourceRelativePath);
  const name = pathName(sourceRelativePath);
  const extension = name.lastIndexOf(".");
  const basename = extension > 0 ? name.slice(0, extension) : name;
  return `${parent ? `${parent}/` : ""}${basename}.webp`;
};

const readerRelativePaths = (sources: AcceptedSource[]): string[] => {
  const segments = sources.map((source) =>
    source.sourceRelativePath.split("/"),
  );
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
    throw new Error(
      `AVIF input is recognized but unsupported: ${sourceRelativePath}`,
    );
  }
  if (source.format === "unknown") {
    throw new Error(
      `Unknown or unsupported image input: ${sourceRelativePath}`,
    );
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
  if (!pathExists)
    throw new Error("Destination existence adapter is required.");

  if (await pathExists(options.destination)) {
    throw new Error(
      `Optimization destination already exists: ${options.destination}`,
    );
  }

  const ignored: string[] = [];
  const accepted: AcceptedSource[] = [];
  for (const source of sortNatural(
    await inspectSource(options.source),
    (item) => item.path,
  )) {
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

  if (accepted.length === 0)
    throw new Error("Source contains no accepted media files.");

  const outputPaths =
    options.profile === "reader"
      ? readerRelativePaths(accepted)
      : accepted.map((source) => source.sourceRelativePath);
  const ordered = sortNatural(
    accepted.map((source, index) => ({
      source,
      outputPath: outputPaths[index]!,
    })),
    ({ outputPath }) => outputPath,
  );
  const items = ordered.map(
    ({ source, outputPath }, index): OptimizationItem => ({
      sourcePath: source.sourcePath,
      sourceRelativePath: outputPath,
      outputRelativePath:
        options.profile === "reader"
          ? createReaderOutputName(index + 1)
          : outputPathForGallerySource(outputPath),
      format: source.format,
      action: source.format === "webp" ? "copy" : "convert",
      bytes: source.source.bytes,
    }),
  );

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

const descriptorHeader = (descriptor: number, length = 32): Uint8Array => {
  const bytes = new Uint8Array(length);
  const count = readSync(descriptor, bytes, 0, length, 0);
  return bytes.slice(0, count);
};

const isZipArchive = async (
  path: string,
  descriptor?: number,
): Promise<boolean> => {
  const bytes =
    descriptor === undefined
      ? new Uint8Array(await Bun.file(path).slice(0, 4).arrayBuffer())
      : descriptorHeader(descriptor, 4);
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
        device: info.dev,
        inode: info.ino,
      });
    }
  };

  await walk(source);
  return sources;
};

const inspectArchive = async (
  source: string,
  runner: CommandRunner,
  sourceDescriptor?: number,
): Promise<OptimizationSource[]> => {
  const entries = await listZipEntries(source, runner, sourceDescriptor);
  const sources: OptimizationSource[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    sources.push({
      path: entry.path,
      format: isIgnoredMediaJunk(entry.path)
        ? "unknown"
        : detectImageFormatFromBytes(
            await readZipEntryHeader(
              source,
              entry,
              undefined,
              sourceDescriptor,
            ),
          ),
      bytes: 0,
    });
  }
  return sources;
};

const inspectConcreteSource = async (
  source: string,
  sourceInfo: Stats,
  runner: CommandRunner,
  sourceDescriptor?: number,
): Promise<SourceInspection> => {
  if (sourceInfo.isDirectory()) {
    return { kind: "directory", sources: await inspectDirectory(source) };
  }
  if (!sourceInfo.isFile()) {
    throw new Error(
      `Optimization source is not a regular file or directory: ${source}`,
    );
  }
  if (await isZipArchive(source, sourceDescriptor)) {
    return {
      kind: "archive",
      sources: await inspectArchive(source, runner, sourceDescriptor),
    };
  }

  return {
    kind: "file",
    sources: [
      {
        path: basename(source),
        format:
          sourceDescriptor === undefined
            ? await detectImageFormat(source)
            : detectImageFormatFromBytes(descriptorHeader(sourceDescriptor)),
        bytes: sourceInfo.size,
        device: sourceInfo.dev,
        inode: sourceInfo.ino,
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

const samePathIdentity = (info: Stats, identity: PathIdentity): boolean =>
  info.dev === identity.device && info.ino === identity.inode;

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

const archiveEntryRelativePath = (
  source: string,
  item: OptimizationItem,
): string => relative(source, item.sourcePath).split(sep).join("/");

const retainArchiveInputs = (
  plan: OptimizationPlan,
  source: string,
  extraction: OwnedDirectory,
): { plan: OptimizationPlan; inputs: RetainedArchiveFile[] } => {
  const inputs: RetainedArchiveFile[] = [];
  try {
    const items = plan.items.map((item) => {
      const relativePath = archiveEntryRelativePath(source, item);
      let input: RetainedArchiveFile;
      try {
        input = retainOwnedArchiveFile(extraction, relativePath);
      } catch (error) {
        throw new Error(
          `Unable to retain extracted archive entry "${relativePath}": ${errorMessage(error)}`,
        );
      }
      inputs.push(input);
      return { ...item, bytes: input.bytes };
    });
    return {
      inputs,
      plan: {
        ...plan,
        items,
        originalBytes: items.reduce((total, item) => total + item.bytes, 0),
      },
    };
  } catch (error) {
    for (const input of inputs) releaseRetainedArchiveFile(input);
    throw error;
  }
};

const retainPathInput = (path: string): RetainedArchiveFile => {
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile()) throw new Error(`Media input is not a file: ${path}`);
    return { descriptor, bytes: info.size };
  } catch (error) {
    releaseRetainedArchiveFile({ descriptor, bytes: 0 });
    throw error;
  }
};

const assertRetainedInputIdentity = (
  input: RetainedArchiveFile,
  source: OptimizationSource | undefined,
): void => {
  if (!source || source.device === undefined || source.inode === undefined) {
    throw new Error(
      `Media input identity was not recorded: ${source?.path ?? "unknown"}`,
    );
  }
  const info = fstatSync(input.descriptor);
  if (
    info.dev !== source.device ||
    info.ino !== source.inode ||
    info.size !== source.bytes
  ) {
    throw new Error(`Media input changed after inspection: ${source.path}`);
  }
};

const copyRetainedFile = (
  source: RetainedArchiveFile,
  destination: RetainedOutputFile,
): void => {
  const buffer = new Uint8Array(64 * 1024);
  let position = 0;
  while (true) {
    const count = readSync(
      source.descriptor,
      buffer,
      0,
      buffer.byteLength,
      position,
    );
    if (count === 0) return;
    let written = 0;
    while (written < count) {
      written += writeSync(
        destination.descriptor,
        buffer,
        written,
        count - written,
        position + written,
      );
    }
    position += count;
  }
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
  let staging: OwnedDirectory | undefined;
  let extraction: OwnedDirectory | undefined;
  let archiveInputs: RetainedArchiveFile[] = [];
  let retainedSource: RetainedArchiveFile | undefined;
  let retainedPathInputs: RetainedArchiveFile[] = [];
  let retainedOutputs: RetainedOutputFile[] = [];
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
    if (sourceInfo.isFile()) {
      retainedSource = retainPathInput(canonicalSource);
      const retainedInfo = fstatSync(retainedSource.descriptor);
      if (!samePathIdentity(retainedInfo, pathIdentity(sourceInfo))) {
        throw new Error(
          `Optimization source changed during validation: ${requestedSource}`,
        );
      }
    }

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
    const destination = join(destinationParent, basename(requestedDestination));
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
    const inspection = await inspectConcreteSource(
      source,
      sourceInfo,
      runner,
      retainedSource?.descriptor,
    );
    let plan = await planMediaOptimization(
      { ...options, source, destination },
      {
        inspectSource: async () => inspection.sources,
        pathExists: async () => false,
        sourceIsFile: inspection.kind === "file",
      },
    );
    plan = { ...plan, destination: requestedDestination };

    if (options.dryRun) {
      if (retainedSource) releaseRetainedArchiveFile(retainedSource);
      retainedSource = undefined;
      releaseDirectoryCapability(destinationParentCapability);
      destinationParentCapability = undefined;
      return dryRunResult(plan);
    }

    const transactionPlatform = adapters.platform ?? process.platform;
    if (transactionPlatform !== "darwin" && transactionPlatform !== "linux") {
      throw new Error(
        `Media optimization is not supported on ${transactionPlatform}; run it on macOS or Linux.`,
      );
    }

    const archiveSource = inspection.kind === "archive";
    if (inspection.kind === "directory") {
      const inspectedByPath = new Map(
        inspection.sources.map((source) => [source.path, source]),
      );
      for (const item of plan.items) {
        const input = retainPathInput(item.sourcePath);
        try {
          assertRetainedInputIdentity(
            input,
            inspectedByPath.get(item.sourcePath),
          );
          retainedPathInputs.push(input);
        } catch (error) {
          releaseRetainedArchiveFile(input);
          throw error;
        }
      }
    }
    requireOptimizationTools(plan, archiveSource, which);

    staging = createStagingDirectory(destination, destinationParentCapability);

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
            sealOwnedDirectoryForRead(extraction);
            const retained = retainArchiveInputs(plan, source, extraction);
            plan = retained.plan;
            archiveInputs = retained.inputs;
          },
          destinationParentCapability,
          retainedSource?.descriptor,
        );
        if (!extraction) {
          throw new Error("Archive extraction ownership was not retained.");
        }
        adapters.afterArchiveOwnershipTransfer?.(extraction.path);
        sealOwnedDirectoryForRead(extraction);
      } catch (error) {
        try {
          const currentParent = await lstat(destinationParent);
          if (!samePathIdentity(currentParent, parentIdentity)) {
            throw new Error("changed");
          }
        } catch {
          throw new Error(
            `Optimization destination parent changed during execution: ${destinationParent}`,
          );
        }
        throw new Error(
          `Unable to extract archive "${source}": ${errorMessage(error)}`,
        );
      }
      if (retainedSource) releaseRetainedArchiveFile(retainedSource);
      retainedSource = undefined;
    }

    const stagedOutputs = plan.items.map((item, index) => {
      const outputFile = retainOwnedOutputFile(
        staging!,
        item.outputRelativePath,
      );
      retainedOutputs.push(outputFile);
      return {
        item,
        sourcePath: item.sourcePath,
        archiveInput:
          inspection.kind === "archive" ? archiveInputs[index] : undefined,
        retainedInput:
          inspection.kind === "archive"
            ? archiveInputs[index]
            : inspection.kind === "file"
              ? retainedSource
              : retainedPathInputs[index],
        outputPath: join(staging!.path, item.outputRelativePath),
        outputFile,
      };
    });

    let converted = 0;
    let copied = 0;
    for (const output of stagedOutputs) {
      try {
        if (output.item.action === "copy") {
          if (!output.retainedInput) {
            throw new Error("Media input was not retained.");
          }
          copyRetainedFile(output.retainedInput, output.outputFile);
          copied += 1;
          continue;
        }

        if (!output.retainedInput) {
          throw new Error("Media input was not retained.");
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
        const executionCommand = createImageCommand({
          format: output.item.format,
          source: "/dev/fd/3",
          destination: "/dev/fd/4",
          quality: plan.quality,
        });
        if (!executionCommand) {
          throw new Error(
            "No capability-bound conversion command was produced.",
          );
        }
        const result = await runner(command, {
          inheritedDescriptors: [
            output.retainedInput.descriptor,
            output.outputFile.descriptor,
          ],
          executionArgv: executionCommand,
        });
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
        if (adapters.verifyOutput) {
          await adapters.verifyOutput(output.outputPath, runner);
        } else {
          await verifyWebp(output.outputPath, runner, {
            inheritedDescriptors: [output.outputFile.descriptor],
            executionArgv: ["webpinfo", "-quiet", "/dev/fd/3"],
          });
        }
        optimizedBytes += fstatSync(output.outputFile.descriptor).size;
      } catch (error) {
        throw new Error(
          `Unable to verify output "${output.item.outputRelativePath}" for "${output.item.sourceRelativePath}": ${errorMessage(error)}`,
        );
      }
    }

    for (const output of retainedOutputs) releaseRetainedOutputFile(output);
    retainedOutputs = [];
    for (const input of archiveInputs) releaseRetainedArchiveFile(input);
    archiveInputs = [];
    for (const input of retainedPathInputs) releaseRetainedArchiveFile(input);
    retainedPathInputs = [];
    if (retainedSource) releaseRetainedArchiveFile(retainedSource);
    retainedSource = undefined;
    if (extraction) cleanupOwnedDirectory(extraction);
    extraction = undefined;

    publishOwnedDirectory(staging, destination, {
      beforePinnedPublish: adapters.beforePinnedPublish,
    });
    releaseOwnedDirectory(staging);
    staging = undefined;
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
    for (const output of retainedOutputs) releaseRetainedOutputFile(output);
    retainedOutputs = [];
    for (const input of archiveInputs) releaseRetainedArchiveFile(input);
    archiveInputs = [];
    for (const input of retainedPathInputs) releaseRetainedArchiveFile(input);
    retainedPathInputs = [];
    if (retainedSource) releaseRetainedArchiveFile(retainedSource);
    retainedSource = undefined;
    for (const owned of [extraction, staging]) {
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
