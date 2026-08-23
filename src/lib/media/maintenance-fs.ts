import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  readSync,
  readFileSync,
  writeSync,
  type Stats,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  assertRetainedDirectoryCapability,
  createOrRetainRelativeDirectoryCapability,
  exchangeRelativeFiles,
  linkRelativeFileNoReplace,
  openRelativeFileDescriptor,
  publishRelativeFileNoReplace,
  relativeDirectoryEntryExists,
  removeRelativeDirectory,
  releaseDirectoryCapability,
  retainDirectoryCapability,
  retainRelativeDirectoryCapability,
  unlinkRelativeFile,
  type DirectoryCapability,
} from "./archive";
import { MediaError } from "./errors";

const operationIdPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

export type MaintenanceLockV1 = {
  schemaVersion: 1;
  operationId: string;
  pid: number;
  mediaRoot: string;
  createdAt: string;
};

export class MaintenanceFilesystemError extends MediaError {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super("maintenance", message);
    this.name = "MaintenanceFilesystemError";
  }
}

const fsError = (code: string, message: string): MaintenanceFilesystemError =>
  new MaintenanceFilesystemError(code, message);

const safeMediaRoot = (mediaRoot: string): string => {
  if (!isAbsolute(mediaRoot) || resolve(mediaRoot) !== mediaRoot) {
    throw fsError("root-unsafe", "media root must be a canonical absolute path");
  }
  return mediaRoot;
};

const requireOperationId = (operationId: string): void => {
  if (!operationIdPattern.test(operationId)) {
    throw fsError("operation-id-invalid", "invalid maintenance operation ID");
  }
};

const relativeSegments = (relativePath: string): string[] => {
  const segments = relativePath.split("/");
  if (
    relativePath.length === 0 ||
    relativePath.includes("\\") ||
    isAbsolute(relativePath) ||
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === ".." || segment.includes("\0"),
    )
  ) {
    throw fsError("path-unsafe", `unsafe relative path: ${relativePath}`);
  }
  return segments;
};

const retainRelativeParent = (
  rootPath: string,
  relativePath: string,
  requireManagedRoot: boolean,
): { parent: DirectoryCapability; name: string } => {
  const segments = relativeSegments(relativePath);
  const name = segments.pop()!;
  if (
    requireManagedRoot &&
    (segments.length === 0 || (segments[0] !== "manga" && segments[0] !== "images"))
  ) {
    throw fsError("path-unsafe", `path is outside the managed roots: ${relativePath}`);
  }
  let current = retainDirectoryCapability(rootPath);
  try {
    for (const segment of segments) {
      let next: DirectoryCapability;
      try {
        next = retainRelativeDirectoryCapability(current, segment);
      } catch {
        if (!relativeDirectoryEntryExists(current, segment)) {
          throw fsError("path-missing", `missing parent path: ${relativePath}`);
        }
        throw fsError("path-unsafe", `unsafe parent path: ${relativePath}`);
      }
      releaseDirectoryCapability(current);
      current = next;
    }
    return { parent: current, name };
  } catch (error) {
    releaseDirectoryCapability(current);
    if (error instanceof MaintenanceFilesystemError) throw error;
    throw fsError("path-unsafe", `unsafe parent path: ${relativePath}`);
  }
};

const retainMaintenanceDirectory = (mediaRoot: string): DirectoryCapability => {
  const canonicalRoot = safeMediaRoot(mediaRoot);
  let root: DirectoryCapability | undefined;
  let astrosphere: DirectoryCapability | undefined;
  try {
    root = retainDirectoryCapability(canonicalRoot);
    astrosphere = createOrRetainRelativeDirectoryCapability(root, ".astrosphere");
    return createOrRetainRelativeDirectoryCapability(astrosphere, "maintenance");
  } catch (error) {
    if (error instanceof MaintenanceFilesystemError) throw error;
    throw fsError("private-path-unsafe", "unsafe maintenance directory");
  } finally {
    if (astrosphere) releaseDirectoryCapability(astrosphere);
    if (root) releaseDirectoryCapability(root);
  }
};

const syncDirectory = (directory: DirectoryCapability): void => {
  assertRetainedDirectoryCapability(directory);
  try {
    fsyncSync(directory.descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF") throw error;
  }
};

const writeAll = (descriptor: number, bytes: Uint8Array): void => {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (written <= 0) throw new Error("short maintenance lock write");
    offset += written;
  }
};

const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const parseLock = (
  directory: DirectoryCapability,
  name: string,
  mediaRoot: string,
): { body: MaintenanceLockV1; device: number; inode: number } => {
  let descriptor = -1;
  try {
    descriptor = openRelativeFileDescriptor(
      directory,
      name,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const info = fstatSync(descriptor);
    const getuid = process.getuid;
    if (
      !info.isFile() ||
      info.size > 4096 ||
      typeof getuid !== "function" ||
      info.uid !== getuid()
    ) {
      throw new Error("unsafe lock file identity");
    }
    const value: unknown = JSON.parse(readFileSync(descriptor, "utf8"));
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !exactKeys(value as Record<string, unknown>, [
        "schemaVersion",
        "operationId",
        "pid",
        "mediaRoot",
        "createdAt",
      ])
    ) {
      throw new Error("invalid lock body");
    }
    const item = value as Record<string, unknown>;
    const createdAt = typeof item.createdAt === "string" ? item.createdAt : "";
    const body: MaintenanceLockV1 = {
      schemaVersion: item.schemaVersion as 1,
      operationId: item.operationId as string,
      pid: item.pid as number,
      mediaRoot: item.mediaRoot as string,
      createdAt,
    };
    if (
      body.schemaVersion !== 1 ||
      typeof body.operationId !== "string" ||
      !operationIdPattern.test(body.operationId) ||
      !Number.isSafeInteger(body.pid) ||
      body.pid <= 0 ||
      body.mediaRoot !== mediaRoot ||
      Number.isNaN(Date.parse(createdAt)) ||
      new Date(createdAt).toISOString() !== createdAt
    ) {
      throw new Error("invalid lock body");
    }
    return { body, device: info.dev, inode: info.ino };
  } catch {
    throw fsError("lock-unsafe", "maintenance lock is unsafe and cannot be recovered");
  } finally {
    if (descriptor >= 0) closeSync(descriptor);
  }
};

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true;
    if (code === "ESRCH") return false;
    throw fsError("lock-unsafe", "could not determine maintenance lock ownership");
  }
};

const restoreQuarantinedName = (
  directory: DirectoryCapability,
  quarantineName: string,
  originalName: string,
  code = "lock-unsafe",
): void => {
  try {
    publishRelativeFileNoReplace(directory, quarantineName, originalName);
  } catch {
    throw fsError(code, `entry changed during recovery: ${originalName}`);
  }
};

const unlinkExactRegular = (
  directory: DirectoryCapability,
  name: string,
  expected: { device: number; inode: number },
  code: string,
): void => {
  const quarantineName = `.${name}-${randomBytes(8).toString("hex")}.unlink`;
  try {
    publishRelativeFileNoReplace(directory, name, quarantineName);
  } catch {
    throw fsError(code, `file changed before removal: ${name}`);
  }
  let descriptor = -1;
  try {
    descriptor = openRelativeFileDescriptor(
      directory,
      quarantineName,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.dev !== expected.device || info.ino !== expected.inode) {
      closeSync(descriptor);
      descriptor = -1;
      restoreQuarantinedName(directory, quarantineName, name, code);
      throw fsError(code, `file identity changed before removal: ${name}`);
    }
    closeSync(descriptor);
    descriptor = -1;
    unlinkRelativeFile(directory, quarantineName);
    syncDirectory(directory);
  } catch (error) {
    if (descriptor >= 0) closeSync(descriptor);
    if (error instanceof MaintenanceFilesystemError) throw error;
    try {
      restoreQuarantinedName(directory, quarantineName, name, code);
    } catch {
      // Preserve the primary fail-closed removal error.
    }
    throw fsError(code, `could not remove exact file: ${name}`);
  }
};

const unlinkExactLock = (
  directory: DirectoryCapability,
  expected: { device: number; inode: number; body: MaintenanceLockV1 },
): void => {
  const quarantineName = `.apply-lock-${randomBytes(8).toString("hex")}.reap`;
  try {
    publishRelativeFileNoReplace(directory, "apply.lock", quarantineName);
  } catch {
    throw fsError("lock-unsafe", "maintenance lock changed before removal");
  }
  let inspected: { body: MaintenanceLockV1; device: number; inode: number };
  try {
    inspected = parseLock(directory, quarantineName, expected.body.mediaRoot);
  } catch (error) {
    restoreQuarantinedName(directory, quarantineName, "apply.lock");
    throw error;
  }
  if (inspected.device !== expected.device || inspected.inode !== expected.inode) {
    restoreQuarantinedName(directory, quarantineName, "apply.lock");
    throw fsError("lock-unsafe", "maintenance lock identity changed before removal");
  }
  try {
    unlinkRelativeFile(directory, quarantineName);
    syncDirectory(directory);
  } catch {
    throw fsError("lock-unsafe", "could not remove the exact maintenance lock");
  }
};

export type MaintenanceLock = {
  readonly body: MaintenanceLockV1;
  readonly path: string;
  readonly device: number;
  readonly inode: number;
  directory: DirectoryCapability;
  released: boolean;
};

const createLock = (
  directory: DirectoryCapability,
  body: MaintenanceLockV1,
): MaintenanceLock | undefined => {
  let descriptor = -1;
  try {
    descriptor = openRelativeFileDescriptor(
      directory,
      "apply.lock",
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    const initial = fstatSync(descriptor);
    if (!initial.isFile()) throw new Error("lock is not regular");
    writeAll(descriptor, new TextEncoder().encode(`${JSON.stringify(body)}\n`));
    fsyncSync(descriptor);
    const final = fstatSync(descriptor);
    if (final.dev !== initial.dev || final.ino !== initial.ino) {
      throw new Error("lock identity changed while writing");
    }
    closeSync(descriptor);
    descriptor = -1;
    syncDirectory(directory);
    return {
      body,
      path: `${directory.path}/apply.lock`,
      device: final.dev,
      inode: final.ino,
      directory,
      released: false,
    };
  } catch {
    if (descriptor >= 0) closeSync(descriptor);
    if (relativeDirectoryEntryExists(directory, "apply.lock")) return undefined;
    throw fsError("lock-unsafe", "could not create maintenance lock safely");
  }
};

export const acquireMaintenanceLock = async (options: {
  mediaRoot: string;
  operationId: string;
  now?: Date;
}): Promise<MaintenanceLock> => {
  const mediaRoot = safeMediaRoot(options.mediaRoot);
  requireOperationId(options.operationId);
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw fsError("lock-unsafe", "invalid lock time");
  const body: MaintenanceLockV1 = {
    schemaVersion: 1,
    operationId: options.operationId,
    pid: process.pid,
    mediaRoot,
    createdAt: now.toISOString(),
  };
  const directory = retainMaintenanceDirectory(mediaRoot);
  try {
    const created = createLock(directory, body);
    if (created) return created;

    const existing = parseLock(directory, "apply.lock", mediaRoot);
    if (processIsAlive(existing.body.pid)) {
      throw fsError("busy", `maintenance apply is already running: ${existing.body.operationId}`);
    }
    unlinkExactLock(directory, existing);
    const recovered = createLock(directory, body);
    if (!recovered) {
      throw fsError("busy", "maintenance lock was acquired during dead-lock recovery");
    }
    return recovered;
  } catch (error) {
    releaseDirectoryCapability(directory);
    throw error;
  }
};

export const releaseMaintenanceLock = async (lock: MaintenanceLock): Promise<void> => {
  if (lock.released) return;
  try {
    unlinkExactLock(lock.directory, lock);
    lock.released = true;
  } finally {
    releaseDirectoryCapability(lock.directory);
  }
};

export type ExpectedRegularFile = {
  device: number;
  inode: number;
  bytes: number;
  mtimeMs: number;
  sha256: string;
};

export type RetainedSnapshot = {
  readonly path: string;
  readonly descriptor: number;
  readonly device: number;
  readonly inode: number;
  readonly bytes: number;
  readonly sha256: string;
  release: () => void;
};

export type SnapshotRegularFileAdapters = {
  afterSourceOpen?: () => void | Promise<void>;
};

const retainOperationStaging = (
  mediaRoot: string,
  operationId: string,
): DirectoryCapability => {
  requireOperationId(operationId);
  const maintenance = retainMaintenanceDirectory(mediaRoot);
  let operation: DirectoryCapability | undefined;
  try {
    operation = createOrRetainRelativeDirectoryCapability(maintenance, operationId);
    return createOrRetainRelativeDirectoryCapability(operation, "staging");
  } catch (error) {
    if (error instanceof MaintenanceFilesystemError) throw error;
    throw fsError("private-path-unsafe", "unsafe operation staging directory");
  } finally {
    if (operation) releaseDirectoryCapability(operation);
    releaseDirectoryCapability(maintenance);
  }
};

const assertExpectedDescriptor = (
  descriptor: number,
  expected: ExpectedRegularFile,
  label: string,
): Stats => {
  const info = fstatSync(descriptor);
  if (
    !info.isFile() ||
    info.dev !== expected.device ||
    info.ino !== expected.inode ||
    info.size !== expected.bytes ||
    info.mtimeMs !== expected.mtimeMs
  ) {
    throw fsError("source-changed", `planned source changed: ${label}`);
  }
  return info;
};

const assertRelativeNameIdentity = (
  parent: DirectoryCapability,
  name: string,
  expected: { device: number; inode: number },
  code: string,
): void => {
  let descriptor = -1;
  try {
    descriptor = openRelativeFileDescriptor(
      parent,
      name,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.dev !== expected.device || info.ino !== expected.inode) {
      throw new Error("identity mismatch");
    }
  } catch {
    throw fsError(code, `file name binding changed: ${name}`);
  } finally {
    if (descriptor >= 0) closeSync(descriptor);
  }
};

export const snapshotRegularFile = async (
  options: {
    mediaRoot: string;
    operationId: string;
    sourceRelativePath: string;
    stagingName: string;
    expected: ExpectedRegularFile;
  },
  adapters: SnapshotRegularFileAdapters = {},
): Promise<RetainedSnapshot> => {
  const mediaRoot = safeMediaRoot(options.mediaRoot);
  const source = retainRelativeParent(mediaRoot, options.sourceRelativePath, true);
  const staging = retainOperationStaging(mediaRoot, options.operationId);
  let sourceDescriptor = -1;
  let stagingDescriptor = -1;
  let retainedDescriptor = -1;
  let stagingIdentity: { device: number; inode: number } | undefined;
  try {
    sourceDescriptor = openRelativeFileDescriptor(
      source.parent,
      source.name,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const sourceInfo = assertExpectedDescriptor(
      sourceDescriptor,
      options.expected,
      options.sourceRelativePath,
    );
    await adapters.afterSourceOpen?.();
    assertRelativeNameIdentity(
      source.parent,
      source.name,
      { device: sourceInfo.dev, inode: sourceInfo.ino },
      "source-changed",
    );
    stagingDescriptor = openRelativeFileDescriptor(
      staging,
      options.stagingName,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(stagingDescriptor, 0o600);
    const created = fstatSync(stagingDescriptor);
    if (!created.isFile()) throw fsError("staging-unsafe", "snapshot staging file is not regular");
    stagingIdentity = { device: created.dev, inode: created.ino };

    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytes = 0;
    for (;;) {
      const read = readSync(sourceDescriptor, buffer, 0, buffer.byteLength, null);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read));
      writeAll(stagingDescriptor, buffer.subarray(0, read));
      bytes += read;
    }
    const digest = hash.digest("hex");
    assertExpectedDescriptor(sourceDescriptor, options.expected, options.sourceRelativePath);
    assertRelativeNameIdentity(
      source.parent,
      source.name,
      { device: sourceInfo.dev, inode: sourceInfo.ino },
      "source-changed",
    );
    if (bytes !== options.expected.bytes || digest !== options.expected.sha256) {
      throw fsError("source-changed", `planned source hash changed: ${options.sourceRelativePath}`);
    }
    fsyncSync(stagingDescriptor);
    fchmodSync(stagingDescriptor, 0o400);
    closeSync(stagingDescriptor);
    stagingDescriptor = -1;

    retainedDescriptor = openRelativeFileDescriptor(
      staging,
      options.stagingName,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const retained = fstatSync(retainedDescriptor);
    if (
      !retained.isFile() ||
      retained.dev !== stagingIdentity.device ||
      retained.ino !== stagingIdentity.inode ||
      retained.size !== bytes
    ) {
      throw fsError("staging-unsafe", "snapshot changed after staging");
    }
    const descriptor = retainedDescriptor;
    retainedDescriptor = -1;
    let released = false;
    return {
      path: `${staging.path}/${options.stagingName}`,
      descriptor,
      device: retained.dev,
      inode: retained.ino,
      bytes,
      sha256: digest,
      release: () => {
        if (released) return;
        closeSync(descriptor);
        released = true;
      },
    };
  } catch (error) {
    if (stagingDescriptor >= 0) closeSync(stagingDescriptor);
    stagingDescriptor = -1;
    if (retainedDescriptor >= 0) closeSync(retainedDescriptor);
    retainedDescriptor = -1;
    if (stagingIdentity) {
      try {
        unlinkExactRegular(staging, options.stagingName, stagingIdentity, "staging-unsafe");
      } catch {
        // Retain the source/staging validation error.
      }
    }
    if (error instanceof MaintenanceFilesystemError) throw error;
    throw fsError("source-changed", `could not snapshot planned source: ${options.sourceRelativePath}`);
  } finally {
    if (sourceDescriptor >= 0) closeSync(sourceDescriptor);
    releaseDirectoryCapability(source.parent);
    releaseDirectoryCapability(staging);
  }
};

const sha256Descriptor = (descriptor: number): { bytes: number; sha256: string } => {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let bytes = 0;
  for (;;) {
    const read = readSync(descriptor, buffer, 0, buffer.byteLength, null);
    if (read === 0) break;
    hash.update(buffer.subarray(0, read));
    bytes += read;
  }
  return { bytes, sha256: hash.digest("hex") };
};

export type ExpectedStagedFile = {
  device: number;
  inode: number;
  bytes: number;
  sha256: string;
};

export type ActivateFileAdapters = {
  afterStagedOpen?: () => void | Promise<void>;
};

export const activateFileNoReplace = async (
  options: {
    mediaRoot: string;
    operationId: string;
    stagingName: string;
    destinationRelativePath: string;
    expected: ExpectedStagedFile;
  },
  adapters: ActivateFileAdapters = {},
): Promise<{ path: string; device: number; inode: number; bytes: number; sha256: string }> => {
  const mediaRoot = safeMediaRoot(options.mediaRoot);
  const staging = retainOperationStaging(mediaRoot, options.operationId);
  let destination: { parent: DirectoryCapability; name: string } | undefined;
  let stagedDescriptor = -1;
  let destinationDescriptor = -1;
  let activated = false;
  try {
    try {
      destination = retainRelativeParent(
        mediaRoot,
        options.destinationRelativePath,
        true,
      );
    } catch (error) {
      if (error instanceof MaintenanceFilesystemError) throw error;
      throw fsError("path-unsafe", "unsafe activation destination parent");
    }
    stagedDescriptor = openRelativeFileDescriptor(
      staging,
      options.stagingName,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const staged = fstatSync(stagedDescriptor);
    if (
      !staged.isFile() ||
      staged.dev !== options.expected.device ||
      staged.ino !== options.expected.inode ||
      staged.size !== options.expected.bytes
    ) {
      throw fsError("staging-changed", "verified staged output changed before activation");
    }
    await adapters.afterStagedOpen?.();
    assertRelativeNameIdentity(
      staging,
      options.stagingName,
      { device: staged.dev, inode: staged.ino },
      "staging-changed",
    );
    const stagedDigest = sha256Descriptor(stagedDescriptor);
    if (
      stagedDigest.bytes !== options.expected.bytes ||
      stagedDigest.sha256 !== options.expected.sha256
    ) {
      throw fsError("staging-changed", "verified staged output hash changed before activation");
    }
    if (staged.dev !== destination.parent.device) {
      throw fsError("cross-device-staging", "staged output is not on the destination filesystem");
    }
    if (relativeDirectoryEntryExists(destination.parent, destination.name)) {
      throw fsError("destination-exists", `activation destination already exists: ${options.destinationRelativePath}`);
    }
    try {
      linkRelativeFileNoReplace(
        staging,
        options.stagingName,
        destination.parent,
        destination.name,
      );
      activated = true;
    } catch {
      if (relativeDirectoryEntryExists(destination.parent, destination.name)) {
        throw fsError("destination-exists", `activation destination already exists: ${options.destinationRelativePath}`);
      }
      throw fsError("activation-unsafe", "could not activate output with an atomic hard link");
    }

    destinationDescriptor = openRelativeFileDescriptor(
      destination.parent,
      destination.name,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const active = fstatSync(destinationDescriptor);
    if (
      !active.isFile() ||
      active.dev !== staged.dev ||
      active.ino !== staged.ino ||
      active.size !== options.expected.bytes
    ) {
      throw fsError("activation-unsafe", "activated output identity does not match staging");
    }
    const activeDigest = sha256Descriptor(destinationDescriptor);
    if (
      activeDigest.bytes !== options.expected.bytes ||
      activeDigest.sha256 !== options.expected.sha256
    ) {
      throw fsError("activation-unsafe", "activated output hash does not match staging");
    }
    assertRelativeNameIdentity(
      staging,
      options.stagingName,
      { device: staged.dev, inode: staged.ino },
      "staging-changed",
    );
    unlinkExactRegular(
      staging,
      options.stagingName,
      { device: staged.dev, inode: staged.ino },
      "staging-changed",
    );
    return {
      path: `${destination.parent.path}/${destination.name}`,
      device: active.dev,
      inode: active.ino,
      bytes: activeDigest.bytes,
      sha256: activeDigest.sha256,
    };
  } catch (error) {
    if (activated && destination) {
      try {
        unlinkExactRegular(
          destination.parent,
          destination.name,
          { device: options.expected.device, inode: options.expected.inode },
          "activation-unsafe",
        );
      } catch {
        // Never unlink a substituted destination while preserving the primary error.
      }
    }
    if (error instanceof MaintenanceFilesystemError) throw error;
    throw fsError("activation-unsafe", "could not safely activate staged output");
  } finally {
    if (stagedDescriptor >= 0) closeSync(stagedDescriptor);
    if (destinationDescriptor >= 0) closeSync(destinationDescriptor);
    if (destination) releaseDirectoryCapability(destination.parent);
    releaseDirectoryCapability(staging);
  }
};

export type ReplaceContentAdapters = {
  beforeExchange?: () => void | Promise<void>;
};

const writeExclusiveRegular = (
  directory: DirectoryCapability,
  name: string,
  bytes: Uint8Array,
  finalMode: number,
): { device: number; inode: number; bytes: number } => {
  let descriptor = -1;
  try {
    descriptor = openRelativeFileDescriptor(
      directory,
      name,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    const initial = fstatSync(descriptor);
    if (!initial.isFile()) throw new Error("created file is not regular");
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
    fchmodSync(descriptor, finalMode);
    const final = fstatSync(descriptor);
    if (
      final.dev !== initial.dev ||
      final.ino !== initial.ino ||
      final.size !== bytes.byteLength
    ) {
      throw new Error("created file identity changed while writing");
    }
    return { device: final.dev, inode: final.ino, bytes: final.size };
  } finally {
    if (descriptor >= 0) closeSync(descriptor);
  }
};

const inspectRelativeFile = (
  directory: DirectoryCapability,
  name: string,
): {
  device: number;
  inode: number;
  bytes: Buffer;
  sha256: string;
} => {
  let descriptor = -1;
  try {
    descriptor = openRelativeFileDescriptor(
      directory,
      name,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    const info = fstatSync(descriptor);
    if (!info.isFile()) throw new Error("not a regular file");
    const bytes = readFileSync(descriptor);
    const final = fstatSync(descriptor);
    if (final.dev !== info.dev || final.ino !== info.ino || final.size !== bytes.byteLength) {
      throw new Error("file changed while reading");
    }
    return {
      device: info.dev,
      inode: info.ino,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    if (descriptor >= 0) closeSync(descriptor);
  }
};

export const replaceContentAtomic = async (
  options: {
    projectRoot: string;
    relativePath: string;
    expectedCurrentSha256: string;
    replacementSha256: string;
    replacementBytes: Uint8Array;
    rollback?: {
      mediaRoot: string;
      operationId: string;
      stagingName: string;
    };
  },
  adapters: ReplaceContentAdapters = {},
): Promise<{
  path: string;
  sha256: string;
  rollback?: {
    path: string;
    device: number;
    inode: number;
    bytes: number;
    sha256: string;
  };
}> => {
  const projectRoot = safeMediaRoot(options.projectRoot);
  const segments = relativeSegments(options.relativePath);
  if (segments.length < 3 || segments[0] !== "src" || segments[1] !== "content") {
    throw fsError("path-unsafe", "content replacement must stay beneath src/content");
  }
  const computedReplacement = createHash("sha256")
    .update(options.replacementBytes)
    .digest("hex");
  if (computedReplacement !== options.replacementSha256) {
    throw fsError("content-changed", "replacement bytes do not match their expected hash");
  }

  const content = retainRelativeParent(projectRoot, options.relativePath, false);
  const temporaryName = `.${content.name}-${randomBytes(8).toString("hex")}.replace`;
  let rollbackDirectory: DirectoryCapability | undefined;
  let current:
    | { device: number; inode: number; bytes: Buffer; sha256: string }
    | undefined;
  let replacementIdentity: { device: number; inode: number } | undefined;
  let rollbackIdentity: { device: number; inode: number } | undefined;
  let exchanged = false;
  try {
    try {
      current = inspectRelativeFile(content.parent, content.name);
    } catch {
      throw fsError("content-changed", `content file is unsafe: ${options.relativePath}`);
    }
    if (current.sha256 !== options.expectedCurrentSha256) {
      throw fsError("content-changed", `content hash changed: ${options.relativePath}`);
    }
    assertRelativeNameIdentity(
      content.parent,
      content.name,
      current,
      "content-changed",
    );

    let rollbackResult:
      | { path: string; device: number; inode: number; bytes: number; sha256: string }
      | undefined;
    if (options.rollback) {
      rollbackDirectory = retainOperationStaging(
        safeMediaRoot(options.rollback.mediaRoot),
        options.rollback.operationId,
      );
      const stored = writeExclusiveRegular(
        rollbackDirectory,
        options.rollback.stagingName,
        current.bytes,
        0o400,
      );
      rollbackIdentity = stored;
      rollbackResult = {
        path: `${rollbackDirectory.path}/${options.rollback.stagingName}`,
        ...stored,
        sha256: current.sha256,
      };
    }

    replacementIdentity = writeExclusiveRegular(
      content.parent,
      temporaryName,
      options.replacementBytes,
      0o600,
    );
    assertRelativeNameIdentity(
      content.parent,
      content.name,
      current,
      "content-changed",
    );
    await adapters.beforeExchange?.();
    exchangeRelativeFiles(content.parent, content.name, temporaryName);
    exchanged = true;

    try {
      const displaced = inspectRelativeFile(content.parent, temporaryName);
      if (
        displaced.device !== current.device ||
        displaced.inode !== current.inode ||
        displaced.sha256 !== options.expectedCurrentSha256
      ) {
        throw fsError("content-changed", `content identity changed before replacement: ${options.relativePath}`);
      }
      const active = inspectRelativeFile(content.parent, content.name);
      if (
        active.device !== replacementIdentity.device ||
        active.inode !== replacementIdentity.inode ||
        active.sha256 !== options.replacementSha256
      ) {
        throw fsError("content-changed", `content replacement verification failed: ${options.relativePath}`);
      }
    } catch (error) {
      exchangeRelativeFiles(content.parent, content.name, temporaryName);
      exchanged = false;
      throw error;
    }

    unlinkExactRegular(
      content.parent,
      temporaryName,
      current,
      "content-changed",
    );
    exchanged = false;
    syncDirectory(content.parent);
    return {
      path: `${content.parent.path}/${content.name}`,
      sha256: options.replacementSha256,
      rollback: rollbackResult,
    };
  } catch (error) {
    if (exchanged) {
      try {
        exchangeRelativeFiles(content.parent, content.name, temporaryName);
        exchanged = false;
      } catch {
        // Preserve the primary fail-closed replacement error.
      }
    }
    if (replacementIdentity && !exchanged) {
      try {
        unlinkExactRegular(
          content.parent,
          temporaryName,
          replacementIdentity,
          "content-changed",
        );
      } catch {
        // Preserve the primary replacement error.
      }
    }
    if (rollbackDirectory && rollbackIdentity && options.rollback) {
      try {
        unlinkExactRegular(
          rollbackDirectory,
          options.rollback.stagingName,
          rollbackIdentity,
          "content-changed",
        );
      } catch {
        // Preserve the primary replacement error.
      }
    }
    if (error instanceof MaintenanceFilesystemError) throw error;
    throw fsError("content-changed", `could not safely replace content: ${options.relativePath}`);
  } finally {
    if (rollbackDirectory) releaseDirectoryCapability(rollbackDirectory);
    releaseDirectoryCapability(content.parent);
  }
};

export type UnlinkPlannedFileAdapters = {
  beforeUnlink?: () => void | Promise<void>;
};

const expectedPublicPath = (relativePath: string): string => {
  const segments = relativeSegments(relativePath);
  if (segments[0] === "manga") return `/${segments.join("/")}`;
  if (segments[0] === "images") return `/media/${segments.join("/")}`;
  throw fsError("path-unsafe", `path is outside the managed roots: ${relativePath}`);
};

export const unlinkPlannedFile = async (
  options: {
    mediaRoot: string;
    relativePath: string;
    publicPath: string;
    expected: ExpectedStagedFile;
    completedDeletions: readonly string[];
  },
  adapters: UnlinkPlannedFileAdapters = {},
): Promise<{ status: "deleted" | "already-deleted" }> => {
  const mediaRoot = safeMediaRoot(options.mediaRoot);
  if (expectedPublicPath(options.relativePath) !== options.publicPath) {
    throw fsError("path-unsafe", "deletion public path does not match its managed path");
  }
  const journaled = options.completedDeletions.includes(options.publicPath);
  let target: { parent: DirectoryCapability; name: string };
  try {
    target = retainRelativeParent(mediaRoot, options.relativePath, true);
  } catch (error) {
    if (
      error instanceof MaintenanceFilesystemError &&
      error.code === "path-missing" &&
      journaled
    ) {
      return { status: "already-deleted" };
    }
    if (error instanceof MaintenanceFilesystemError && error.code === "path-missing") {
      throw fsError("target-missing", `planned deletion target is absent: ${options.publicPath}`);
    }
    throw error;
  }
  let descriptor = -1;
  try {
    if (!relativeDirectoryEntryExists(target.parent, target.name)) {
      if (journaled) return { status: "already-deleted" };
      throw fsError("target-missing", `planned deletion target is absent: ${options.publicPath}`);
    }
    try {
      descriptor = openRelativeFileDescriptor(
        target.parent,
        target.name,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
    } catch {
      throw fsError("target-changed", `planned deletion target is unsafe: ${options.publicPath}`);
    }
    const initial = fstatSync(descriptor);
    if (
      !initial.isFile() ||
      initial.dev !== options.expected.device ||
      initial.ino !== options.expected.inode ||
      initial.size !== options.expected.bytes
    ) {
      throw fsError("target-changed", `planned deletion target identity changed: ${options.publicPath}`);
    }
    const digest = sha256Descriptor(descriptor);
    const final = fstatSync(descriptor);
    if (
      final.dev !== initial.dev ||
      final.ino !== initial.ino ||
      final.size !== initial.size ||
      digest.bytes !== options.expected.bytes ||
      digest.sha256 !== options.expected.sha256
    ) {
      throw fsError("target-changed", `planned deletion target hash changed: ${options.publicPath}`);
    }
    assertRelativeNameIdentity(
      target.parent,
      target.name,
      { device: initial.dev, inode: initial.ino },
      "target-changed",
    );
    await adapters.beforeUnlink?.();
    unlinkExactRegular(
      target.parent,
      target.name,
      { device: initial.dev, inode: initial.ino },
      "target-changed",
    );
    return { status: "deleted" };
  } finally {
    if (descriptor >= 0) closeSync(descriptor);
    releaseDirectoryCapability(target.parent);
  }
};

export type RemoveEmptyManagedParentsAdapters = {
  beforeDirectoryQuarantine?: (relativePath: string) => void | Promise<void>;
};

export const removeEmptyManagedParents = async (
  options: {
    mediaRoot: string;
    relativePath: string;
  },
  adapters: RemoveEmptyManagedParentsAdapters = {},
): Promise<string[]> => {
  const mediaRoot = safeMediaRoot(options.mediaRoot);
  const fileSegments = relativeSegments(options.relativePath);
  if (fileSegments[0] !== "manga" && fileSegments[0] !== "images") {
    throw fsError("path-unsafe", "cleanup path is outside the managed roots");
  }
  const parentSegments = fileSegments.slice(0, -1);
  const removed: string[] = [];
  while (parentSegments.length > 1) {
    const name = parentSegments[parentSegments.length - 1]!;
    const parentRelative = parentSegments.slice(0, -1).join("/");
    let holder: { parent: DirectoryCapability; name: string };
    try {
      holder = retainRelativeParent(
        mediaRoot,
        `${parentRelative}/.cleanup-placeholder`,
        true,
      );
    } catch (error) {
      if (error instanceof MaintenanceFilesystemError && error.code === "path-missing") break;
      throw error;
    }
    let candidate: DirectoryCapability | undefined;
    const quarantineName = `.${name}-${randomBytes(8).toString("hex")}.rmdir`;
    try {
      try {
        candidate = retainRelativeDirectoryCapability(holder.parent, name);
      } catch {
        if (!relativeDirectoryEntryExists(holder.parent, name)) break;
        throw fsError("path-unsafe", `cleanup parent is not a real directory: ${parentSegments.join("/")}`);
      }
      const identity = { device: candidate.device, inode: candidate.inode };
      await adapters.beforeDirectoryQuarantine?.(parentSegments.join("/"));
      try {
        publishRelativeFileNoReplace(holder.parent, name, quarantineName);
      } catch {
        throw fsError("path-unsafe", `cleanup parent changed before removal: ${parentSegments.join("/")}`);
      }
      let quarantined: DirectoryCapability | undefined;
      try {
        quarantined = retainRelativeDirectoryCapability(holder.parent, quarantineName);
        if (
          quarantined.device !== identity.device ||
          quarantined.inode !== identity.inode
        ) {
          releaseDirectoryCapability(quarantined);
          quarantined = undefined;
          restoreQuarantinedName(holder.parent, quarantineName, name, "path-unsafe");
          throw fsError("path-unsafe", `cleanup parent identity changed: ${parentSegments.join("/")}`);
        }
      } catch (error) {
        if (quarantined) releaseDirectoryCapability(quarantined);
        if (error instanceof MaintenanceFilesystemError) throw error;
        restoreQuarantinedName(holder.parent, quarantineName, name, "path-unsafe");
        throw fsError("path-unsafe", `cleanup parent became unsafe: ${parentSegments.join("/")}`);
      }
      releaseDirectoryCapability(quarantined);
      releaseDirectoryCapability(candidate);
      candidate = undefined;
      try {
        removeRelativeDirectory(holder.parent, quarantineName);
      } catch {
        restoreQuarantinedName(holder.parent, quarantineName, name, "path-unsafe");
        break;
      }
      syncDirectory(holder.parent);
      removed.push(parentSegments.join("/"));
      parentSegments.pop();
    } finally {
      if (candidate) releaseDirectoryCapability(candidate);
      releaseDirectoryCapability(holder.parent);
    }
  }
  return removed;
};
