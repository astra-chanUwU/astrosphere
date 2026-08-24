import { dirname, extname, join, relative } from "node:path";
import { lstat, readdir } from "node:fs/promises";
import sharp from "sharp";
import { getMediaLayout } from "./config";
import { detectImageFormatFromBytes, type ImageFormat } from "./image-format";
import {
  webReaderLandscapeWidth,
  webReaderPortraitWidth,
  type OptimizerProfile,
} from "./optimizer";
import { resolveMediaUrl } from "./paths";
import type { MediaReference } from "./references";

export type MediaValidationIssue = {
  code: "missing" | "unsafe" | "unsupported" | "corrupt" | "format-mismatch";
  source: string;
  field: string;
  publicPath: string;
  message: string;
};

export type MediaOrphan = {
  publicPath: string;
  filePath: string;
  bytes: number;
};

export type MediaValidationReport = {
  references: number;
  files: number;
  errors: MediaValidationIssue[];
  orphans: MediaOrphan[];
  oversized: MediaOversizeWarning[];
};

export type MediaOversizeWarning = {
  directory: string;
  profile: OptimizerProfile;
  files: number;
  bytes: number;
  maxWidth: number;
  maxHeight: number;
};

export type MediaLibraryFile = {
  filePath: string;
  publicPath: string;
  relativePath: string;
  bytes: number;
  mtimeMs: number;
  format: ImageFormat;
  device: number;
  inode: number;
  width?: number;
  height?: number;
  animated?: boolean;
  /** Retains discovered-entry failures so validation can replay them without I/O. */
  issue?: { kind: "missing" | "unsafe"; message?: string };
};

export type MediaLibrarySnapshot = {
  root: string;
  files: MediaLibraryFile[];
};

export type MediaFileInspection =
  | { kind: "missing" }
  | { kind: "unsafe"; message?: string }
  | {
      kind: "file";
      format: ImageFormat;
      bytes: number;
      mtimeMs?: number;
      device?: number;
      inode?: number;
      width?: number;
      height?: number;
      animated?: boolean;
    };

export type ScanManagedMediaAdapters = {
  walkManagedFiles?: (root: string) => Promise<string[]>;
  inspectFile?: (path: string) => Promise<MediaFileInspection>;
};

export type ValidateMediaOptions = {
  root: string;
  references: MediaReference[];
  snapshot?: MediaLibrarySnapshot;
  walkManagedFiles?: (root: string) => Promise<string[]>;
  inspectFile?: (path: string) => Promise<MediaFileInspection>;
};

const hasErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const inspectMediaFile = async (path: string): Promise<MediaFileInspection> => {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return { kind: "missing" };
    throw error;
  }
  if (!info.isFile() || info.isSymbolicLink()) {
    return { kind: "unsafe", message: "Managed media must be a regular file" };
  }

  const header = new Uint8Array(
    await Bun.file(path).slice(0, 32).arrayBuffer(),
  );
  const format = detectImageFormatFromBytes(header);
  let dimensions: Pick<
    MediaLibraryFile,
    "width" | "height" | "animated"
  > = {};
  if (format !== "unknown") {
    try {
      const metadata = await sharp(path).metadata();
      dimensions = {
        width: metadata.width,
        height: metadata.height,
        animated: (metadata.pages ?? 1) > 1,
      };
    } catch {
      dimensions = {};
    }
  }
  return {
    kind: "file",
    format,
    bytes: info.size,
    ...dimensions,
    mtimeMs: info.mtimeMs,
    device: info.dev,
    inode: info.ino,
  };
};

const walkMediaTree = async (directory: string): Promise<string[]> => {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return [];
    throw error;
  }

  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walkMediaTree(path)));
    else paths.push(path);
  }
  return paths;
};

const walkManagedMediaFiles = async (root: string): Promise<string[]> => {
  const layout = getMediaLayout(root);
  const paths = [
    ...(await walkMediaTree(layout.manga)),
    ...(await walkMediaTree(layout.images)),
  ];
  return paths.sort();
};

const expectedFormat = (publicPath: string): ImageFormat | undefined => {
  switch (extname(publicPath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "jpeg";
    case ".png":
      return "png";
    case ".gif":
      return "gif";
    case ".webp":
      return "webp";
    case ".avif":
      return "avif";
    default:
      return undefined;
  }
};

const issueForInspection = (
  reference: MediaReference,
  inspection: MediaFileInspection,
): MediaValidationIssue | undefined => {
  if (inspection.kind === "missing") {
    return {
      code: "missing",
      ...reference,
      message: "Missing media file",
    };
  }
  if (inspection.kind === "unsafe") {
    return {
      code: "unsafe",
      ...reference,
      message: inspection.message ?? "Unsafe managed media entry",
    };
  }

  const expected = expectedFormat(reference.publicPath);
  if (!expected) {
    return {
      code: "unsupported",
      ...reference,
      message: "Unsupported managed media extension",
    };
  }
  if (inspection.format === "unknown") {
    return {
      code: "corrupt",
      ...reference,
      message: "Media header is missing or corrupt",
    };
  }
  if (inspection.format !== expected) {
    return {
      code: "format-mismatch",
      ...reference,
      message: `Expected ${expected} content but detected ${inspection.format}`,
    };
  }
  return undefined;
};

const publicPathForFile = (root: string, filePath: string): string => {
  const layout = getMediaLayout(root);
  const mangaPath = relative(layout.manga, filePath);
  if (mangaPath !== "" && !mangaPath.startsWith("..")) {
    return `/manga/${mangaPath.replaceAll("\\", "/")}`;
  }
  const imagePath = relative(layout.images, filePath);
  return `/media/images/${imagePath.replaceAll("\\", "/")}`;
};

const oversizedMediaWarnings = (
  root: string,
  files: MediaLibraryFile[],
): MediaOversizeWarning[] => {
  const layout = getMediaLayout(root);
  const grouped = new Map<string, MediaOversizeWarning>();

  for (const file of files) {
    if (
      file.issue ||
      file.format !== "webp" ||
      file.animated ||
      file.width === undefined ||
      file.height === undefined
    ) {
      continue;
    }
    const limit =
      file.width > file.height
        ? webReaderLandscapeWidth
        : webReaderPortraitWidth;
    if (file.width <= limit) continue;

    const mangaRelative = relative(layout.manga, file.filePath);
    let directory: string;
    let profile: OptimizerProfile;
    if (mangaRelative !== "" && !mangaRelative.startsWith("..")) {
      const segments = mangaRelative.split(/[\\/]/);
      const inReaderDirectory = segments.length >= 3;
      directory = inReaderDirectory
        ? dirname(file.filePath)
        : join(layout.manga, segments[0]!);
      profile = inReaderDirectory ? "reader" : "gallery";
    } else {
      const imageRelative = relative(layout.images, file.filePath);
      const slug = imageRelative.split(/[\\/]/)[0]!;
      directory = join(layout.images, slug);
      profile = "gallery";
    }

    const key = `${profile}\0${directory}`;
    const warning = grouped.get(key) ?? {
      directory,
      profile,
      files: 0,
      bytes: 0,
      maxWidth: 0,
      maxHeight: 0,
    };
    warning.files += 1;
    warning.bytes += file.bytes;
    warning.maxWidth = Math.max(warning.maxWidth, file.width);
    warning.maxHeight = Math.max(warning.maxHeight, file.height);
    grouped.set(key, warning);
  }

  return [...grouped.values()].sort((left, right) =>
    left.directory.localeCompare(right.directory),
  );
};

export const scanManagedMedia = async (
  root: string,
  adapters: ScanManagedMediaAdapters = {},
): Promise<MediaLibrarySnapshot> => {
  if (!adapters.walkManagedFiles) {
    const layout = getMediaLayout(root);
    for (const directory of [layout.manga, layout.images]) {
      let info;
      try {
        info = await lstat(directory);
      } catch (error) {
        if (hasErrorCode(error, "ENOENT")) continue;
        throw error;
      }
      if (!info.isDirectory() || info.isSymbolicLink()) {
        throw new Error(`Managed media namespace must be a real directory: ${directory}`);
      }
    }
  }
  const walkManagedFiles = adapters.walkManagedFiles ?? walkManagedMediaFiles;
  const inspectFile = adapters.inspectFile ?? inspectMediaFile;
  const filePaths = [...new Set(await walkManagedFiles(root))].sort();
  const files: MediaLibraryFile[] = [];

  for (const filePath of filePaths) {
    const inspection = await inspectFile(filePath);
    const publicPath = publicPathForFile(root, filePath);
    const base = {
      filePath,
      publicPath,
      relativePath: relative(root, filePath).replaceAll("\\", "/"),
    };
    if (inspection.kind === "file") {
      files.push({
        ...base,
        bytes: inspection.bytes,
        mtimeMs: inspection.mtimeMs ?? 0,
        format: inspection.format,
        device: inspection.device ?? 0,
        inode: inspection.inode ?? 0,
        width: inspection.width,
        height: inspection.height,
        animated: inspection.animated,
      });
    } else {
      files.push({
        ...base,
        bytes: 0,
        mtimeMs: 0,
        format: "unknown",
        device: 0,
        inode: 0,
        issue: inspection,
      });
    }
  }

  files.sort((left, right) => left.publicPath.localeCompare(right.publicPath));
  return { root, files };
};

export const validateMedia = async (
  options: ValidateMediaOptions,
): Promise<MediaValidationReport> => {
  if (options.snapshot && resolveSnapshotRoot(options.snapshot.root) !== resolveSnapshotRoot(options.root)) {
    throw new Error("Media library snapshot root does not match validation root");
  }
  const snapshot = options.snapshot ?? await scanManagedMedia(options.root, {
    walkManagedFiles: options.walkManagedFiles,
    inspectFile: options.inspectFile,
  });
  const files = snapshot.files;
  const byFilePath = new Map(files.map((file) => [file.filePath, file]));
  const fallbackInspectionCache = new Map<string, Promise<MediaFileInspection>>();
  const inspectionFor = (file: MediaLibraryFile): MediaFileInspection =>
    file.issue ?? { kind: "file", format: file.format, bytes: file.bytes };
  const inspectOmittedReference = (filePath: string): Promise<MediaFileInspection> => {
    let inspection = fallbackInspectionCache.get(filePath);
    if (!inspection) {
      inspection = (options.inspectFile ?? inspectMediaFile)(filePath);
      fallbackInspectionCache.set(filePath, inspection);
    }
    return inspection;
  };

  const errors: MediaValidationIssue[] = [];
  const issueKeys = new Set<string>();
  const referencedPaths = new Set<string>();
  const addIssue = (issue: MediaValidationIssue): void => {
    const key = `${issue.code}\0${issue.source}\0${issue.field}\0${issue.publicPath}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    errors.push(issue);
  };

  for (const reference of options.references) {
    referencedPaths.add(reference.publicPath);
    let filePath: string;
    try {
      filePath = resolveMediaUrl(reference.publicPath, options.root).filePath;
    } catch (error) {
      addIssue({
        code: "unsafe",
        ...reference,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const file = byFilePath.get(filePath);
    const issue = issueForInspection(
      reference,
      file
        ? inspectionFor(file)
        : options.snapshot
          ? { kind: "missing" }
          : await inspectOmittedReference(filePath),
    );
    if (issue) addIssue(issue);
  }

  const orphans: MediaOrphan[] = [];
  for (const file of files) {
    const { filePath, publicPath } = file;
    if (referencedPaths.has(publicPath)) {
      continue;
    }
    const inspection = inspectionFor(file);
    const filesystemReference = {
      source: "filesystem",
      field: "file",
      publicPath,
    };
    const issue = issueForInspection(filesystemReference, inspection);
    if (issue) {
      addIssue(issue);
      continue;
    }
    if (inspection.kind === "file") {
      orphans.push({ publicPath, filePath, bytes: inspection.bytes });
    }
  }

  errors.sort(
    (left, right) =>
      left.publicPath.localeCompare(right.publicPath) ||
      left.source.localeCompare(right.source) ||
      left.field.localeCompare(right.field) ||
      left.code.localeCompare(right.code),
  );
  orphans.sort((left, right) =>
    left.publicPath.localeCompare(right.publicPath),
  );
  return {
    references: options.references.length,
    files: files.length,
    errors,
    orphans,
    oversized: oversizedMediaWarnings(options.root, files),
  };
};

const resolveSnapshotRoot = (root: string): string =>
  root.replace(/[\\/]+$/, "") || root;

export const formatMediaValidationReport = (
  report: MediaValidationReport,
): string => {
  const lines = report.errors.map(
    (issue) =>
      `ERROR [${issue.code}] ${issue.publicPath} (${issue.source} ${issue.field}): ${issue.message}`,
  );
  lines.push(
    ...report.oversized.map(
      (warning) =>
        `WARNING [oversized] ${warning.directory} (${warning.files} files, ${warning.bytes} bytes, up to ${warning.maxWidth}x${warning.maxHeight})\n` +
        `  Run: bun run media:optimize ${JSON.stringify(warning.directory)} --profile ${warning.profile} --web-reader --in-place`,
    ),
  );
  lines.push(
    ...report.orphans.map(
      (orphan) =>
        `WARNING [orphan] ${orphan.publicPath} (${orphan.bytes} bytes)`,
    ),
  );
  lines.push(
    `References: ${report.references} | Files: ${report.files} | Errors: ${report.errors.length} | Orphans: ${report.orphans.length} | Oversized: ${report.oversized.length}`,
  );
  return lines.join("\n");
};
