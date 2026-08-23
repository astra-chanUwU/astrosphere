import { lstatSync } from "node:fs";
import { lstat, statfs } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { loadMediaContentEntries, type MediaContentEntry } from "./content-source";
import { MediaError } from "./errors";
import {
  assertMaintenanceDirectoryIdentity,
  createOperationId,
  ensureMaintenanceDirectory,
  maintenancePaths,
  sha256File,
  writeNewManifest,
  writeStateAtomic,
} from "./maintenance-manifest";
import { planMaintenanceContentRewrites } from "./maintenance-rewrites";
import type {
  MaintenanceConversionV1,
  MaintenanceDeletionV1,
  MaintenanceManifestV1,
  MaintenancePlanResult,
  MaintenanceStateV1,
  MaintenanceTotals,
} from "./maintenance-types";
import { resolveMediaUrl } from "./paths";
import { collectManagedMediaReferences } from "./references";
import {
  scanManagedMedia,
  validateMedia,
  type MediaLibrarySnapshot,
} from "./validator";

const SPACE_MARGIN_BYTES = 64 * 1024 * 1024;

export type PlanMediaMaintenanceOptions = {
  projectRoot: string;
  mediaRoot: string;
  quality: number;
};

type PathIdentity = {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
};

export type PlanMediaMaintenanceAdapters = {
  now?: () => Date;
  randomBytes?: () => string;
  availableBytes?: (path: string) => Promise<number>;
  loadContentEntries?: (projectRoot: string) => Promise<MediaContentEntry[]>;
  scanMedia?: (mediaRoot: string) => Promise<MediaLibrarySnapshot>;
  hashFile?: (path: string) => Promise<string>;
  readText?: (path: string) => string | Promise<string>;
  pathExists?: (path: string) => Promise<boolean>;
  statPath?: (path: string) => Promise<PathIdentity>;
  afterSnapshot?: () => void | Promise<void>;
  writeManifest?: typeof writeNewManifest;
  writeState?: typeof writeStateAtomic;
};

export class MaintenancePlanError extends MediaError {
  constructor(
    public readonly code: string,
    message: string,
    public readonly context?: Record<string, string | number | boolean>,
  ) {
    super("maintenance", message);
    this.name = "MaintenancePlanError";
  }
}

const planError = (
  code: string,
  message: string,
  context?: Record<string, string | number | boolean>,
): MaintenancePlanError => new MaintenancePlanError(code, message, context);

const exists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
};

const filesystemAvailableBytes = async (path: string): Promise<number> => {
  const stats = await statfs(path);
  return Number(stats.bavail) * Number(stats.bsize);
};

const portablePathKey = (path: string): string => path.normalize("NFC").toLowerCase();

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareRelativePath = <T extends { relativePath: string }>(left: T, right: T): number =>
  compareCodeUnits(left.relativePath, right.relativePath);

const assertAbsoluteRoot = (path: string, label: string): string => {
  if (!isAbsolute(path)) throw planError("root-invalid", `${label} must be absolute`);
  return resolve(path);
};

const captureDirectoryIdentity = async (
  path: string,
  label: string,
  statPath: (path: string) => Promise<PathIdentity>,
): Promise<{ path: string; device: number; inode: number }> => {
  let stats: PathIdentity;
  try {
    stats = await statPath(path);
  } catch {
    throw planError("root-unsafe", `${label} is missing or cannot be inspected: ${path}`);
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw planError("root-unsafe", `${label} must be a real directory: ${path}`);
  }
  return { path, device: stats.dev, inode: stats.ino };
};

const assertSameIdentities = async (
  identities: Array<{ path: string; device: number; inode: number }>,
  statPath: (path: string) => Promise<PathIdentity>,
): Promise<void> => {
  for (const identity of identities) {
    let current: PathIdentity;
    try {
      current = await statPath(identity.path);
    } catch {
      throw planError("root-changed", `approved root changed while planning: ${identity.path}`);
    }
    if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.device || current.ino !== identity.inode) {
      throw planError("root-changed", `approved root changed while planning: ${identity.path}`);
    }
  }
};

const assertCandidateIdentitySync = (
  candidate: MediaLibrarySnapshot["files"][number],
): void => {
  let current;
  try {
    current = lstatSync(candidate.filePath);
  } catch {
    throw planError("candidate-changed", `maintenance candidate changed after scanning: ${candidate.publicPath}`);
  }
  if (
    !current.isFile() ||
    current.isSymbolicLink() ||
    current.dev !== candidate.device ||
    current.ino !== candidate.inode ||
    current.size !== candidate.bytes ||
    current.mtimeMs !== candidate.mtimeMs
  ) {
    throw planError("candidate-changed", `maintenance candidate changed after scanning: ${candidate.publicPath}`);
  }
};

const assertCandidateNameBindingSync = (
  candidate: MediaLibrarySnapshot["files"][number],
  mediaRoot: string,
): void => {
  const resolvedPublicPath = resolveMediaUrl(candidate.publicPath, mediaRoot).filePath;
  const resolvedRelativePath = resolve(mediaRoot, candidate.relativePath);
  if (
    resolve(candidate.filePath) !== resolvedPublicPath ||
    resolvedRelativePath !== resolvedPublicPath ||
    relative(mediaRoot, resolvedRelativePath).replaceAll("\\", "/") !== candidate.relativePath
  ) {
    throw planError("candidate-changed", `maintenance candidate name binding changed: ${candidate.publicPath}`);
  }
};

const assertCandidatesSync = (
  candidates: readonly MediaLibrarySnapshot["files"][number][],
  mediaRoot: string,
): void => {
  for (const candidate of candidates) {
    assertCandidateNameBindingSync(candidate, mediaRoot);
    assertCandidateIdentitySync(candidate);
  }
};

const contentFilePath = (projectRoot: string, source: string): string => {
  if (
    isAbsolute(source) ||
    source.includes("\\") ||
    !source.startsWith("src/content/") ||
    source.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw planError("content-path-unsafe", `content file is outside src/content: ${source}`);
  }
  const contentRoot = resolve(projectRoot, "src/content");
  const path = resolve(projectRoot, source);
  const relationToContent = relative(contentRoot, path);
  if (relationToContent === "" || relationToContent.startsWith("..") || isAbsolute(relationToContent)) {
    throw planError("content-path-unsafe", `content file is outside src/content: ${source}`);
  }
  return path;
};

const assertAffectedContentFiles = async (
  projectRoot: string,
  entries: MediaContentEntry[],
  affectedSources: ReadonlySet<string>,
  statPath: (path: string) => Promise<PathIdentity>,
): Promise<Map<string, PathIdentity>> => {
  const identities = new Map<string, PathIdentity>();
  for (const entry of entries) {
    contentFilePath(projectRoot, entry.path);
    if (!affectedSources.has(entry.path)) continue;
    const path = contentFilePath(projectRoot, entry.path);
    let stats: PathIdentity;
    try {
      stats = await statPath(path);
    } catch {
      throw planError("content-path-unsafe", `affected content file cannot be inspected: ${entry.path}`);
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw planError("content-path-unsafe", `affected content file must be a real file: ${entry.path}`);
    }
    identities.set(entry.path, stats);
  }
  return identities;
};

const assertContentIdentity = async (
  projectRoot: string,
  relativePath: string,
  expected: PathIdentity,
  statPath: (path: string) => Promise<PathIdentity>,
): Promise<void> => {
  let current: PathIdentity;
  try {
    current = await statPath(contentFilePath(projectRoot, relativePath));
  } catch {
    throw planError("content-changed", `content changed while planning: ${relativePath}`);
  }
  if (
    !current.isFile() ||
    current.isSymbolicLink() ||
    current.dev !== expected.dev ||
    current.ino !== expected.ino ||
    current.size !== expected.size ||
    current.mtimeMs !== expected.mtimeMs
  ) {
    throw planError("content-changed", `content changed while planning: ${relativePath}`);
  }
};

const assertContentIdentitySync = (
  projectRoot: string,
  relativePath: string,
  expected: PathIdentity,
): void => {
  let current;
  try {
    current = lstatSync(contentFilePath(projectRoot, relativePath));
  } catch {
    throw planError("content-changed", `content changed while planning: ${relativePath}`);
  }
  if (
    !current.isFile() ||
    current.isSymbolicLink() ||
    current.dev !== expected.dev ||
    current.ino !== expected.ino ||
    current.size !== expected.size ||
    current.mtimeMs !== expected.mtimeMs
  ) {
    throw planError("content-changed", `content changed while planning: ${relativePath}`);
  }
};

const assertRootIdentitiesSync = (
  identities: readonly { path: string; device: number; inode: number }[],
): void => {
  for (const identity of identities) {
    let current;
    try {
      current = lstatSync(identity.path);
    } catch {
      throw planError("root-changed", `approved root changed while planning: ${identity.path}`);
    }
    if (
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== identity.device ||
      current.ino !== identity.inode
    ) {
      throw planError("root-changed", `approved root changed while planning: ${identity.path}`);
    }
  }
};

const assertDestinationsAbsentSync = (
  mediaRoot: string,
  destinations: readonly string[],
): void => {
  for (const publicPath of destinations) {
    const filePath = resolveMediaUrl(publicPath, mediaRoot).filePath;
    try {
      lstatSync(filePath);
      throw planError("destination-collision", `WebP destination already exists: ${publicPath}`);
    } catch (error) {
      if (error instanceof MaintenancePlanError) throw error;
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
};

const destinationFor = (path: string): string => path.replace(/\.[^./]+$/, ".webp");

const totalsFrom = (
  snapshot: MediaLibrarySnapshot,
  references: number,
  errors: number,
  orphans: number,
): MaintenanceTotals => ({
  files: snapshot.files.length,
  bytes: snapshot.files.reduce((sum, file) => sum + file.bytes, 0),
  references,
  errors,
  orphans,
});

const plannedState = (operationId: string): MaintenanceStateV1 => ({
  schemaVersion: 1,
  operationId,
  phase: "planned",
  completedConversions: [],
  activatedDestinations: [],
  completedContentRewrites: [],
  completedDeletions: [],
});

export const planMediaMaintenance = async (
  options: PlanMediaMaintenanceOptions,
  adapters: PlanMediaMaintenanceAdapters = {},
): Promise<MaintenancePlanResult> => {
  const projectRoot = assertAbsoluteRoot(options.projectRoot, "project root");
  const mediaRoot = assertAbsoluteRoot(options.mediaRoot, "media root");
  if (!Number.isSafeInteger(options.quality) || options.quality < 1 || options.quality > 100) {
    throw planError("quality-invalid", "maintenance quality must be an integer from 1 to 100");
  }

  const statPath = adapters.statPath ?? lstat;
  const identities = await Promise.all([
    captureDirectoryIdentity(projectRoot, "project root", statPath),
    captureDirectoryIdentity(resolve(projectRoot, "src/content"), "content root", statPath),
    captureDirectoryIdentity(mediaRoot, "media root", statPath),
    captureDirectoryIdentity(resolve(mediaRoot, "images"), "images root", statPath),
    captureDirectoryIdentity(resolve(mediaRoot, "manga"), "manga root", statPath),
  ]);

  const entries = await (adapters.loadContentEntries ?? loadMediaContentEntries)(projectRoot);
  const references = collectManagedMediaReferences(entries);
  for (const reference of references) {
    contentFilePath(projectRoot, reference.source);
    try {
      resolveMediaUrl(reference.publicPath, mediaRoot);
    } catch (error) {
      throw planError("reference-path-unsafe", error instanceof Error ? error.message : String(error));
    }
  }

  const snapshot = await (adapters.scanMedia ?? scanManagedMedia)(mediaRoot);
  if (resolve(snapshot.root) !== mediaRoot) {
    throw planError("snapshot-root-mismatch", "media snapshot root does not match the requested media root");
  }
  await adapters.afterSnapshot?.();
  const report = await validateMedia({ root: mediaRoot, references, snapshot });
  const baseline = totalsFrom(snapshot, report.references, report.errors.length, report.orphans.length);
  if (report.errors.length > 0) {
    throw planError("baseline-invalid", "media maintenance requires a zero-error validator baseline", {
      errors: report.errors.length,
    });
  }

  const referencesByPublicPath = new Map<string, Array<{ source: string; field: string }>>();
  for (const reference of references) {
    const grouped = referencesByPublicPath.get(reference.publicPath) ?? [];
    grouped.push({ source: reference.source, field: reference.field });
    referencesByPublicPath.set(reference.publicPath, grouped);
  }
  for (const grouped of referencesByPublicPath.values()) {
    grouped.sort((left, right) =>
      compareCodeUnits(`${left.source}\0${left.field}`, `${right.source}\0${right.field}`));
  }

  const candidates = snapshot.files
    .filter((file) => referencesByPublicPath.has(file.publicPath))
    .filter((file) => file.format === "jpeg" || file.format === "png" || file.format === "gif")
    .sort(compareRelativePath);
  const orphanByPublicPath = new Map(report.orphans.map((orphan) => [orphan.publicPath, orphan]));
  if (candidates.length === 0 && orphanByPublicPath.size === 0) {
    await assertSameIdentities(identities, statPath);
    return { status: "clean", baseline };
  }

  const snapshotPortablePaths = new Map<string, string>();
  for (const file of snapshot.files) {
    const key = portablePathKey(file.relativePath);
    const prior = snapshotPortablePaths.get(key);
    if (prior && prior !== file.relativePath) {
      throw planError("portable-name-collision", `managed files collide by portable name: ${prior} and ${file.relativePath}`);
    }
    snapshotPortablePaths.set(key, file.relativePath);
  }

  const pathExists = adapters.pathExists ?? exists;
  const destinationPortablePaths = new Map<string, string>();
  const replacements = new Map<string, string>();
  for (const candidate of candidates) {
    const destinationPublicPath = destinationFor(candidate.publicPath);
    const destinationRelativePath = destinationFor(candidate.relativePath);
    const key = portablePathKey(destinationRelativePath);
    const prior = destinationPortablePaths.get(key);
    const existing = snapshotPortablePaths.get(key);
    if (prior || existing) {
      throw planError("destination-collision", `WebP destination collides with ${prior ?? existing}: ${destinationRelativePath}`);
    }
    const destination = resolveMediaUrl(destinationPublicPath, mediaRoot);
    if (await pathExists(destination.filePath)) {
      throw planError("destination-collision", `WebP destination already exists: ${destinationPublicPath}`);
    }
    destinationPortablePaths.set(key, destinationRelativePath);
    replacements.set(candidate.publicPath, destinationPublicPath);
  }

  const affectedSources = new Set(
    references.filter((reference) => replacements.has(reference.publicPath)).map((reference) => reference.source),
  );
  const contentIdentities = await assertAffectedContentFiles(projectRoot, entries, affectedSources, statPath);
  const rewrites = await planMaintenanceContentRewrites(
    projectRoot,
    entries,
    replacements,
    adapters.readText,
    references,
  );
  if (rewrites.length !== affectedSources.size) {
    throw planError("content-rewrite-incomplete", "not every affected content file produced a rewrite");
  }

  const orphanCandidates = snapshot.files
    .filter((item) => orphanByPublicPath.has(item.publicPath))
    .sort(compareRelativePath);
  const affectedCandidates = [...candidates, ...orphanCandidates].sort(compareRelativePath);
  const sourceBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
  const deletionBytes = affectedCandidates.reduce((sum, item) => sum + item.bytes, 0);
  const requiredBytes = sourceBytes + Math.max(SPACE_MARGIN_BYTES, Math.ceil(sourceBytes * 0.1));
  const maintenanceDirectory = ensureMaintenanceDirectory(mediaRoot);
  const availableBytes = await (adapters.availableBytes ?? filesystemAvailableBytes)(maintenanceDirectory.path);
  if (!Number.isSafeInteger(availableBytes) || availableBytes < requiredBytes) {
    throw planError("insufficient-space", "insufficient free space for maintenance staging", { requiredBytes, availableBytes });
  }
  assertMaintenanceDirectoryIdentity(mediaRoot, maintenanceDirectory);

  await assertSameIdentities(identities, statPath);
  for (const rewrite of rewrites) {
    await assertContentIdentity(
      projectRoot,
      rewrite.relativePath,
      contentIdentities.get(rewrite.relativePath)!,
      statPath,
    );
  }
  for (const candidate of candidates) {
    const destinationPublicPath = replacements.get(candidate.publicPath)!;
    const destination = resolveMediaUrl(destinationPublicPath, mediaRoot);
    if (await pathExists(destination.filePath)) {
      throw planError("destination-collision", `WebP destination already exists: ${destinationPublicPath}`);
    }
  }
  assertMaintenanceDirectoryIdentity(mediaRoot, maintenanceDirectory);
  assertCandidatesSync(affectedCandidates, mediaRoot);

  const hashFile = adapters.hashFile ?? sha256File;
  for (const rewrite of rewrites) {
    const identity = contentIdentities.get(rewrite.relativePath);
    if (!identity) {
      throw planError("content-rewrite-incomplete", `missing content identity: ${rewrite.relativePath}`);
    }
    assertContentIdentitySync(projectRoot, rewrite.relativePath, identity);
    const actual = await hashFile(contentFilePath(projectRoot, rewrite.relativePath));
    assertContentIdentitySync(projectRoot, rewrite.relativePath, identity);
    if (actual !== rewrite.beforeSha256) {
      throw planError("content-changed", `content changed while planning: ${rewrite.relativePath}`);
    }
  }
  assertCandidatesSync(affectedCandidates, mediaRoot);

  const candidateHashes = new Map<string, string>();
  for (const candidate of affectedCandidates) {
    assertCandidateNameBindingSync(candidate, mediaRoot);
    assertCandidateIdentitySync(candidate);
    const digest = await hashFile(candidate.filePath);
    assertCandidateNameBindingSync(candidate, mediaRoot);
    assertCandidateIdentitySync(candidate);
    candidateHashes.set(candidate.relativePath, digest);
  }
  assertCandidatesSync(affectedCandidates, mediaRoot);
  for (const rewrite of rewrites) {
    assertContentIdentitySync(
      projectRoot,
      rewrite.relativePath,
      contentIdentities.get(rewrite.relativePath)!,
    );
  }

  const conversions: MaintenanceConversionV1[] = candidates.map((candidate) => ({
    sourceRelativePath: candidate.relativePath,
    sourcePublicPath: candidate.publicPath,
    sourceBytes: candidate.bytes,
    sourceMtimeMs: candidate.mtimeMs,
    sourceSha256: candidateHashes.get(candidate.relativePath)!,
    sourceFormat: candidate.format as "jpeg" | "png" | "gif",
    destinationRelativePath: destinationFor(candidate.relativePath),
    destinationPublicPath: replacements.get(candidate.publicPath)!,
    references: referencesByPublicPath.get(candidate.publicPath)!,
  }));
  const deletions: MaintenanceDeletionV1[] = [
    ...conversions.map((conversion) => ({
      relativePath: conversion.sourceRelativePath,
      publicPath: conversion.sourcePublicPath,
      bytes: conversion.sourceBytes,
      sha256: conversion.sourceSha256,
      reason: "replaced-original" as const,
    })),
    ...orphanCandidates.map((candidate) => ({
      relativePath: candidate.relativePath,
      publicPath: candidate.publicPath,
      bytes: candidate.bytes,
      sha256: candidateHashes.get(candidate.relativePath)!,
      reason: "orphan" as const,
    })),
  ].sort(compareRelativePath);
  const now = (adapters.now ?? (() => new Date()))();
  const operationId = createOperationId(now, adapters.randomBytes);
  const intermediate: MaintenanceTotals = {
    files: baseline.files + conversions.length,
    bytes: baseline.bytes + sourceBytes,
    references: baseline.references,
    errors: 0,
    orphans: baseline.orphans + conversions.length,
  };
  const final: MaintenanceTotals = {
    files: baseline.files - baseline.orphans,
    bytes: intermediate.bytes - deletionBytes,
    references: baseline.references,
    errors: 0,
    orphans: 0,
  };
  const manifest: MaintenanceManifestV1 = {
    schemaVersion: 1,
    operationId,
    createdAt: now.toISOString(),
    roots: { projectRoot, mediaRoot },
    quality: options.quality,
    validatorBaseline: baseline,
    conversions,
    deletions,
    contentRewrites: rewrites,
    destinationChecks: conversions.map((item) => ({
      relativePath: item.destinationRelativePath,
      publicPath: item.destinationPublicPath,
    })),
    expectedIntermediateTotals: intermediate,
    expectedFinalTotals: final,
  };
  assertRootIdentitiesSync(identities);
  for (const rewrite of rewrites) {
    assertContentIdentitySync(
      projectRoot,
      rewrite.relativePath,
      contentIdentities.get(rewrite.relativePath)!,
    );
  }
  assertDestinationsAbsentSync(
    mediaRoot,
    conversions.map((conversion) => conversion.destinationPublicPath),
  );
  assertMaintenanceDirectoryIdentity(mediaRoot, maintenanceDirectory);
  assertCandidatesSync(affectedCandidates, mediaRoot);
  await (adapters.writeManifest ?? writeNewManifest)(mediaRoot, manifest);
  await (adapters.writeState ?? writeStateAtomic)(mediaRoot, operationId, plannedState(operationId));
  return {
    status: "planned",
    operationId,
    manifestPath: maintenancePaths(mediaRoot, operationId).manifest,
    summary: {
      conversions: conversions.length,
      deletions: deletions.length,
      contentRewrites: rewrites.length,
      sourceBytes,
      deletionBytes,
    },
  };
};
