import { isAbsolute, join, relative } from "node:path";
import type { ImageFormat } from "./image-format";

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
