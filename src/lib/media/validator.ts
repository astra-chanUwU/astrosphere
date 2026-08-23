import { extname, join, relative } from "node:path";
import { lstat, readdir } from "node:fs/promises";
import { getMediaLayout } from "./config";
import { detectImageFormatFromBytes, type ImageFormat } from "./image-format";
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
};

export type MediaFileInspection =
  | { kind: "missing" }
  | { kind: "unsafe"; message?: string }
  | { kind: "file"; format: ImageFormat; bytes: number };

export type ValidateMediaOptions = {
  root: string;
  references: MediaReference[];
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
  return {
    kind: "file",
    format: detectImageFormatFromBytes(header),
    bytes: info.size,
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

export const validateMedia = async (
  options: ValidateMediaOptions,
): Promise<MediaValidationReport> => {
  const walkManagedFiles = options.walkManagedFiles ?? walkManagedMediaFiles;
  const inspectFile = options.inspectFile ?? inspectMediaFile;
  const files = [...new Set(await walkManagedFiles(options.root))].sort();
  const inspectionCache = new Map<string, Promise<MediaFileInspection>>();
  const inspect = (path: string): Promise<MediaFileInspection> => {
    let inspection = inspectionCache.get(path);
    if (!inspection) {
      inspection = inspectFile(path);
      inspectionCache.set(path, inspection);
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
    const issue = issueForInspection(reference, await inspect(filePath));
    if (issue) addIssue(issue);
  }

  const orphans: MediaOrphan[] = [];
  for (const filePath of files) {
    const publicPath = publicPathForFile(options.root, filePath);
    if (referencedPaths.has(publicPath)) {
      await inspect(filePath);
      continue;
    }
    const inspection = await inspect(filePath);
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
  };
};

export const formatMediaValidationReport = (
  report: MediaValidationReport,
): string => {
  const lines = report.errors.map(
    (issue) =>
      `ERROR [${issue.code}] ${issue.publicPath} (${issue.source} ${issue.field}): ${issue.message}`,
  );
  lines.push(
    ...report.orphans.map(
      (orphan) =>
        `WARNING [orphan] ${orphan.publicPath} (${orphan.bytes} bytes)`,
    ),
  );
  lines.push(
    `References: ${report.references} | Files: ${report.files} | Errors: ${report.errors.length} | Orphans: ${report.orphans.length}`,
  );
  return lines.join("\n");
};
