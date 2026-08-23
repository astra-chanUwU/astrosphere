import { randomBytes as nodeRandomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, readSync, writeSync } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { isAbsolute, join, resolve, win32 } from "node:path";
import {
  assertRetainedDirectoryCapability,
  createOrRetainRelativeDirectoryCapability,
  openRelativeFileDescriptor,
  publishRelativeFileNoReplace,
  releaseDirectoryCapability,
  renameRelativeFileReplace,
  relativeDirectoryEntryExists,
  retainDirectoryCapability,
  retainRelativeDirectoryCapability,
  unlinkRelativeFile,
  type DirectoryCapability,
} from "./archive";
import { MediaError } from "./errors";
import type {
  MaintenanceContentEditV1,
  MaintenanceContentRewriteV1,
  MaintenanceConversionV1,
  MaintenanceDeletionV1,
  MaintenanceDestinationCheckV1,
  MaintenanceFailureV1,
  MaintenanceFinalResultV1,
  MaintenanceManifestV1,
  MaintenancePhaseV1,
  MaintenanceStateV1,
  MaintenanceTotals,
} from "./maintenance-types";

const operationIdPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
const hashPattern = /^[a-f0-9]{64}$/;
const failureCodePattern = /^[a-z0-9][a-z0-9-]{0,79}$/;

const isMaintenancePhaseV1 = (value: unknown): value is MaintenancePhaseV1 => {
  switch (value) {
    case "planned":
    case "staging":
    case "activated":
    case "deleting":
    case "complete":
    case "failed-before-delete":
    case "blocked-after-delete":
      return true;
    default:
      return false;
  }
};

export class MaintenanceStateError extends MediaError {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super("maintenance", message);
    this.name = "MaintenanceStateError";
  }
}

const stateError = (code: string, message: string): MaintenanceStateError =>
  new MaintenanceStateError(code, message);

const requireOperationId = (operationId: string): void => {
  if (!operationIdPattern.test(operationId)) {
    throw stateError(
      "operation-id-invalid",
      "operation ID must contain only lowercase letters, numbers, and hyphens (1 to 80 characters)",
    );
  }
};

export const maintenancePaths = (root: string, operationId: string) => {
  requireOperationId(operationId);
  if (!isAbsolute(root)) {
    throw stateError("media-root-invalid", "media root must be absolute");
  }
  const directory = join(resolve(root), ".astrosphere", "maintenance");
  const operation = join(directory, operationId);
  return {
    directory,
    manifest: join(directory, `${operationId}.manifest.json`),
    state: join(directory, `${operationId}.state.json`),
    operation,
    staging: join(operation, "staging"),
    lock: join(directory, "apply.lock"),
  };
};

export type MaintenanceDirectoryIdentity = {
  path: string;
  device: number;
  inode: number;
};

const privatePathError = (path: string): MaintenanceStateError =>
  stateError("private-path-unsafe", `unsafe private maintenance path: ${path}`);

export type MaintenanceManifestAdapters = {
  afterRetainMaintenanceDirectory?: () => void;
};

const retainMaintenanceDirectory = (
  mediaRoot: string,
  create: boolean,
): DirectoryCapability => {
  let root: DirectoryCapability | undefined;
  let astrosphere: DirectoryCapability | undefined;
  try {
    root = retainDirectoryCapability(resolve(mediaRoot));
    astrosphere = create
      ? createOrRetainRelativeDirectoryCapability(root, ".astrosphere")
      : retainRelativeDirectoryCapability(root, ".astrosphere");
    const maintenance = create
      ? createOrRetainRelativeDirectoryCapability(astrosphere, "maintenance")
      : retainRelativeDirectoryCapability(astrosphere, "maintenance");
    return maintenance;
  } catch (error) {
    throw privatePathError(resolve(mediaRoot));
  } finally {
    if (astrosphere) releaseDirectoryCapability(astrosphere);
    if (root) releaseDirectoryCapability(root);
  }
};

export const ensureMaintenanceDirectory = (
  mediaRoot: string,
): MaintenanceDirectoryIdentity => {
  const directory = retainMaintenanceDirectory(mediaRoot, true);
  try {
    assertRetainedDirectoryCapability(directory);
    return {
      path: directory.path,
      device: directory.device,
      inode: directory.inode,
    };
  } finally {
    releaseDirectoryCapability(directory);
  }
};

export const assertMaintenanceDirectoryIdentity = (
  mediaRoot: string,
  expected: MaintenanceDirectoryIdentity,
): void => {
  const directory = retainMaintenanceDirectory(mediaRoot, false);
  try {
    assertRetainedDirectoryCapability(directory);
    if (
      directory.path !== expected.path ||
      directory.device !== expected.device ||
      directory.inode !== expected.inode
    ) {
      throw stateError(
        "private-path-changed",
        `private maintenance directory changed while planning: ${expected.path}`,
      );
    }
  } finally {
    releaseDirectoryCapability(directory);
  }
};

const syncRetainedDirectory = (directory: DirectoryCapability): void => {
  assertRetainedDirectoryCapability(directory);
  try {
    fsyncSync(directory.descriptor);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "ENOTSUP" && code !== "EBADF") throw error;
  }
};

const closeDescriptor = (descriptor: number): void => {
  if (descriptor >= 0) closeSync(descriptor);
};

const requireRegularDescriptor = (descriptor: number, label: string): void => {
  if (!fstatSync(descriptor).isFile()) {
    throw privatePathError(label);
  }
};

const writeAll = (descriptor: number, bytes: Uint8Array): void => {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (written <= 0) throw new Error("could not write maintenance record");
    offset += written;
  }
};

const padded = (value: number): string => String(value).padStart(2, "0");

export const createOperationId = (
  now: Date,
  randomBytes: () => string = () => nodeRandomBytes(4).toString("hex"),
): string => {
  if (Number.isNaN(now.getTime())) {
    throw stateError("operation-time-invalid", "operation time must be valid");
  }
  const token = randomBytes();
  if (!/^[a-f0-9]{8}$/.test(token)) {
    throw stateError("operation-token-invalid", "operation random token must be 8 lowercase hexadecimal characters");
  }
  return `${now.getUTCFullYear()}${padded(now.getUTCMonth() + 1)}${padded(now.getUTCDate())}t${padded(now.getUTCHours())}${padded(now.getUTCMinutes())}${padded(now.getUTCSeconds())}z-${token}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
};

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void => {
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown field: ${unknown[0]}`);
  const missing = keys.find((key) => !(key in value));
  if (missing) throw new Error(`${label} is missing field: ${missing}`);
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
};

const safeInteger = (value: unknown, label: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label} must be a safe integer at least ${minimum}`);
  }
  return Number(value);
};

const finiteNumber = (value: unknown, label: string, minimum = 0): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new Error(`${label} must be a finite number at least ${minimum}`);
  }
  return value;
};

const storedRelativePath = (value: unknown, label: string): string => {
  const path = requiredString(value, label);
  if (
    isAbsolute(path) ||
    win32.isAbsolute(path) ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a safe root-relative path`);
  }
  return path;
};

const publicPath = (value: unknown, label: string): string => {
  const path = requiredString(value, label);
  if (
    !path.startsWith("/") ||
    path.includes("\\") ||
    path.split("/").slice(1).some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`${label} must be a safe root-relative public path`);
  }
  return path;
};

const sha256 = (value: unknown, label: string): string => {
  const hash = requiredString(value, label);
  if (!hashPattern.test(hash)) throw new Error(`${label} must be a lowercase SHA-256 hash`);
  return hash;
};

const canonicalRoot = (value: unknown, label: string): string => {
  const root = requiredString(value, label);
  if (!isAbsolute(root) || resolve(root) !== root) {
    throw new Error(`${label} must be a canonical absolute path`);
  }
  return root;
};

const portablePathKey = (path: string): string => path.normalize("NFC").toLowerCase();

const sortedUnique = (values: string[], label: string): void => {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1]! >= values[index]!) {
      throw new Error(`${label} must be strictly sorted and unique`);
    }
  }
};

const totals = (value: unknown, label: string): MaintenanceTotals => {
  const item = record(value, label);
  exactKeys(item, ["files", "bytes", "references", "errors", "orphans"], label);
  return {
    files: safeInteger(item.files, `${label}.files`),
    bytes: safeInteger(item.bytes, `${label}.bytes`),
    references: safeInteger(item.references, `${label}.references`),
    errors: safeInteger(item.errors, `${label}.errors`),
    orphans: safeInteger(item.orphans, `${label}.orphans`),
  };
};

const references = (value: unknown, label: string): Array<{ source: string; field: string }> => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const parsed = value.map((entry, index) => {
    const item = record(entry, `${label}[${index}]`);
    exactKeys(item, ["source", "field"], `${label}[${index}]`);
    return {
      source: storedRelativePath(item.source, `${label}[${index}].source`),
      field: requiredString(item.field, `${label}[${index}].field`),
    };
  });
  sortedUnique(parsed.map((item) => `${item.source}\u0000${item.field}`), label);
  return parsed;
};

const conversion = (value: unknown, label: string): MaintenanceConversionV1 => {
  const item = record(value, label);
  exactKeys(item, [
    "sourceRelativePath", "sourcePublicPath", "sourceBytes", "sourceMtimeMs",
    "sourceSha256", "sourceFormat", "destinationRelativePath", "destinationPublicPath",
    "references",
  ], label);
  if (!["jpeg", "png", "gif"].includes(item.sourceFormat as string)) {
    throw new Error(`${label}.sourceFormat must be jpeg, png, or gif`);
  }
  return {
    sourceRelativePath: storedRelativePath(item.sourceRelativePath, `${label}.sourceRelativePath`),
    sourcePublicPath: publicPath(item.sourcePublicPath, `${label}.sourcePublicPath`),
    sourceBytes: safeInteger(item.sourceBytes, `${label}.sourceBytes`),
    sourceMtimeMs: finiteNumber(item.sourceMtimeMs, `${label}.sourceMtimeMs`),
    sourceSha256: sha256(item.sourceSha256, `${label}.sourceSha256`),
    sourceFormat: item.sourceFormat as MaintenanceConversionV1["sourceFormat"],
    destinationRelativePath: storedRelativePath(item.destinationRelativePath, `${label}.destinationRelativePath`),
    destinationPublicPath: publicPath(item.destinationPublicPath, `${label}.destinationPublicPath`),
    references: references(item.references, `${label}.references`),
  };
};

const deletion = (value: unknown, label: string): MaintenanceDeletionV1 => {
  const item = record(value, label);
  exactKeys(item, ["relativePath", "publicPath", "bytes", "sha256", "reason"], label);
  if (item.reason !== "orphan" && item.reason !== "replaced-original") {
    throw new Error(`${label}.reason must be orphan or replaced-original`);
  }
  return {
    relativePath: storedRelativePath(item.relativePath, `${label}.relativePath`),
    publicPath: publicPath(item.publicPath, `${label}.publicPath`),
    bytes: safeInteger(item.bytes, `${label}.bytes`),
    sha256: sha256(item.sha256, `${label}.sha256`),
    reason: item.reason,
  };
};

const edit = (value: unknown, label: string): MaintenanceContentEditV1 => {
  const item = record(value, label);
  exactKeys(item, ["start", "end", "before", "after", "field"], label);
  const start = safeInteger(item.start, `${label}.start`);
  const end = safeInteger(item.end, `${label}.end`);
  if (end <= start) throw new Error(`${label}.end must be after start`);
  return {
    start,
    end,
    before: requiredString(item.before, `${label}.before`),
    after: requiredString(item.after, `${label}.after`),
    field: requiredString(item.field, `${label}.field`),
  };
};

const contentRewrite = (value: unknown, label: string): MaintenanceContentRewriteV1 => {
  const item = record(value, label);
  exactKeys(item, ["relativePath", "beforeSha256", "afterSha256", "edits"], label);
  if (!Array.isArray(item.edits) || item.edits.length === 0) {
    throw new Error(`${label}.edits must be a non-empty array`);
  }
  const edits = item.edits.map((entry, index) => edit(entry, `${label}.edits[${index}]`));
  for (let index = 1; index < edits.length; index += 1) {
    if (edits[index - 1]!.end > edits[index]!.start) {
      throw new Error(`${label}.edits must be sorted and non-overlapping`);
    }
  }
  return {
    relativePath: storedRelativePath(item.relativePath, `${label}.relativePath`),
    beforeSha256: sha256(item.beforeSha256, `${label}.beforeSha256`),
    afterSha256: sha256(item.afterSha256, `${label}.afterSha256`),
    edits,
  };
};

const destinationCheck = (value: unknown, label: string): MaintenanceDestinationCheckV1 => {
  const item = record(value, label);
  exactKeys(item, ["relativePath", "publicPath"], label);
  return {
    relativePath: storedRelativePath(item.relativePath, `${label}.relativePath`),
    publicPath: publicPath(item.publicPath, `${label}.publicPath`),
  };
};

const pathArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  const paths = value.map((entry, index) => storedRelativePath(entry, `${label}[${index}]`));
  sortedUnique(paths, label);
  return paths;
};

const finalResult = (value: unknown, label: string): MaintenanceFinalResultV1 => {
  const item = record(value, label);
  exactKeys(item, ["status", "totals"], label);
  if (item.status !== "applied" && item.status !== "already-applied") {
    throw new Error(`${label}.status must be applied or already-applied`);
  }
  return { status: item.status, totals: totals(item.totals, `${label}.totals`) };
};

const failure = (value: unknown, label: string): MaintenanceFailureV1 => {
  const item = record(value, label);
  exactKeys(item, ["code", "message"], label);
  const code = requiredString(item.code, `${label}.code`);
  if (!failureCodePattern.test(code)) throw new Error(`${label}.code must be a stable machine code`);
  return { code, message: requiredString(item.message, `${label}.message`) };
};

export const validateManifest = (value: unknown, mediaRoot: string): MaintenanceManifestV1 => {
  const item = record(value, "manifest");
  exactKeys(item, [
    "schemaVersion", "operationId", "createdAt", "roots", "quality", "validatorBaseline",
    "conversions", "deletions", "contentRewrites", "destinationChecks",
    "expectedIntermediateTotals", "expectedFinalTotals",
  ], "manifest");
  if (item.schemaVersion !== 1) throw new Error("manifest.schemaVersion must be 1");
  const operationId = requiredString(item.operationId, "manifest.operationId");
  requireOperationId(operationId);
  const createdAt = requiredString(item.createdAt, "manifest.createdAt");
  if (new Date(createdAt).toISOString() !== createdAt) {
    throw new Error("manifest.createdAt must be a canonical ISO timestamp");
  }
  const roots = record(item.roots, "manifest.roots");
  exactKeys(roots, ["projectRoot", "mediaRoot"], "manifest.roots");
  const canonicalMediaRoot = canonicalRoot(roots.mediaRoot, "manifest.roots.mediaRoot");
  if (canonicalMediaRoot !== resolve(mediaRoot)) {
    throw new Error("manifest media root does not match the requested media root");
  }
  if (!Number.isSafeInteger(item.quality) || Number(item.quality) < 1 || Number(item.quality) > 100) {
    throw new Error("manifest.quality must be an integer from 1 to 100");
  }
  if (!Array.isArray(item.conversions) || !Array.isArray(item.deletions) || !Array.isArray(item.contentRewrites) || !Array.isArray(item.destinationChecks)) {
    throw new Error("manifest record lists must be arrays");
  }
  const conversions = item.conversions.map((entry, index) => conversion(entry, `manifest.conversions[${index}]`));
  const deletions = item.deletions.map((entry, index) => deletion(entry, `manifest.deletions[${index}]`));
  const contentRewrites = item.contentRewrites.map((entry, index) => contentRewrite(entry, `manifest.contentRewrites[${index}]`));
  const destinationChecks = item.destinationChecks.map((entry, index) => destinationCheck(entry, `manifest.destinationChecks[${index}]`));
  sortedUnique(conversions.map((entry) => entry.sourceRelativePath), "manifest.conversions");
  sortedUnique(deletions.map((entry) => entry.relativePath), "manifest.deletions");
  sortedUnique(contentRewrites.map((entry) => entry.relativePath), "manifest.contentRewrites");
  sortedUnique(destinationChecks.map((entry) => entry.relativePath), "manifest.destinationChecks");

  const replaced = new Map(
    deletions.filter((entry) => entry.reason === "replaced-original").map((entry) => [entry.relativePath, entry]),
  );
  for (const entry of conversions) {
    const replacement = replaced.get(entry.sourceRelativePath);
    if (!replacement || replacement.publicPath !== entry.sourcePublicPath || replacement.sha256 !== entry.sourceSha256 || replacement.bytes !== entry.sourceBytes) {
      throw new Error("each conversion source must have the matching replaced-original deletion");
    }
  }
  const expectedDestinationKeys = new Set(conversions.map((entry) => entry.destinationRelativePath));
  if (expectedDestinationKeys.size !== destinationChecks.length || destinationChecks.some((entry) => !expectedDestinationKeys.has(entry.relativePath))) {
    throw new Error("destination checks must exactly match conversion destinations");
  }
  const portableSources = new Set<string>();
  const portableDestinations = new Set<string>();
  for (const entry of conversions) {
    const source = portablePathKey(entry.sourceRelativePath);
    const destination = portablePathKey(entry.destinationRelativePath);
    if (portableSources.has(source) || portableDestinations.has(destination) || portableSources.has(destination) || portableDestinations.has(source)) {
      throw new Error("manifest has a portable-name collision between conversion source and destination paths");
    }
    portableSources.add(source);
    portableDestinations.add(destination);
  }
  return {
    schemaVersion: 1,
    operationId,
    createdAt,
    roots: {
      projectRoot: canonicalRoot(roots.projectRoot, "manifest.roots.projectRoot"),
      mediaRoot: canonicalMediaRoot,
    },
    quality: Number(item.quality),
    validatorBaseline: totals(item.validatorBaseline, "manifest.validatorBaseline"),
    conversions,
    deletions,
    contentRewrites,
    destinationChecks,
    expectedIntermediateTotals: totals(item.expectedIntermediateTotals, "manifest.expectedIntermediateTotals"),
    expectedFinalTotals: totals(item.expectedFinalTotals, "manifest.expectedFinalTotals"),
  };
};

export const validateState = (value: unknown, operationId: string): MaintenanceStateV1 => {
  const item = record(value, "state");
  const phase = item.phase;
  if (!isMaintenancePhaseV1(phase)) {
    throw new Error("state.phase is invalid");
  }
  const baseKeys = ["schemaVersion", "operationId", "phase", "completedConversions", "activatedDestinations", "completedContentRewrites", "completedDeletions"];
  exactKeys(item, phase === "complete" ? [...baseKeys, "result"] : phase === "failed-before-delete" || phase === "blocked-after-delete" ? [...baseKeys, "failure"] : baseKeys, "state");
  if (item.schemaVersion !== 1) throw new Error("state.schemaVersion must be 1");
  const stateOperationId = requiredString(item.operationId, "state.operationId");
  requireOperationId(stateOperationId);
  if (stateOperationId !== operationId) throw new Error("state operation ID does not match the requested operation");
  const base = {
    schemaVersion: 1 as const,
    operationId: stateOperationId,
    completedConversions: pathArray(item.completedConversions, "state.completedConversions"),
    activatedDestinations: pathArray(item.activatedDestinations, "state.activatedDestinations"),
    completedContentRewrites: pathArray(item.completedContentRewrites, "state.completedContentRewrites"),
    completedDeletions: pathArray(item.completedDeletions, "state.completedDeletions"),
  };
  if (phase === "complete") return { ...base, phase, result: finalResult(item.result, "state.result") };
  if (phase === "failed-before-delete" || phase === "blocked-after-delete") {
    return { ...base, phase, failure: failure(item.failure, "state.failure") };
  }
  return { ...base, phase };
};

const readJson = (
  directory: DirectoryCapability,
  name: string,
  missingCode: string,
  invalidCode: string,
): unknown => {
  let descriptor = -1;
  let bytes: Uint8Array;
  try {
    assertRetainedDirectoryCapability(directory);
    descriptor = openRelativeFileDescriptor(
      directory,
      name,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    requireRegularDescriptor(descriptor, name);
    bytes = new Uint8Array(fstatSync(descriptor).size);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const read = readSync(descriptor, bytes, offset, bytes.byteLength - offset, offset);
      if (read <= 0) throw new Error("maintenance record changed while reading");
      offset += read;
    }
  } catch {
    try {
      if (!relativeDirectoryEntryExists(directory, name)) {
        throw stateError(missingCode, `maintenance record is missing: ${name}`);
      }
    } catch (error) {
      if (error instanceof MaintenanceStateError) throw error;
    }
    throw stateError(invalidCode, `could not safely read maintenance record: ${name}`);
  } finally {
    closeDescriptor(descriptor);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw stateError(invalidCode, `maintenance record contains invalid JSON: ${name}`);
  }
};

export const writeNewManifest = async (
  mediaRoot: string,
  manifest: MaintenanceManifestV1,
  adapters: MaintenanceManifestAdapters = {},
): Promise<void> => {
  let parsed: MaintenanceManifestV1;
  try {
    parsed = validateManifest(manifest, mediaRoot);
  } catch (error) {
    throw stateError("manifest-invalid", (error as Error).message);
  }
  const temporaryName = `.${parsed.operationId}.manifest-${nodeRandomBytes(8).toString("hex")}.tmp`;
  const manifestName = `${parsed.operationId}.manifest.json`;
  const directory = retainMaintenanceDirectory(mediaRoot, true);
  let descriptor = -1;
  try {
    adapters.afterRetainMaintenanceDirectory?.();
    assertRetainedDirectoryCapability(directory);
    descriptor = openRelativeFileDescriptor(
      directory,
      temporaryName,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    requireRegularDescriptor(descriptor, temporaryName);
    writeAll(descriptor, new TextEncoder().encode(`${JSON.stringify(parsed)}\n`));
    fsyncSync(descriptor);
    closeDescriptor(descriptor);
    descriptor = -1;
    publishRelativeFileNoReplace(directory, temporaryName, manifestName);
    syncRetainedDirectory(directory);
  } catch (error) {
    if (error instanceof MaintenanceStateError) throw error;
    if ((error as Error).message.includes("without replacing an existing destination")) {
      throw stateError("manifest-already-exists", `maintenance manifest already exists: ${parsed.operationId}`);
    }
    throw stateError("manifest-write-failed", `could not write maintenance manifest: ${parsed.operationId}`);
  } finally {
    closeDescriptor(descriptor);
    try {
      unlinkRelativeFile(directory, temporaryName);
    } catch {
      // The no-replace publish removes the temporary name; retain primary errors.
    }
    releaseDirectoryCapability(directory);
  }
};

export const readManifest = async (
  mediaRoot: string,
  operationId: string,
  adapters: MaintenanceManifestAdapters = {},
): Promise<MaintenanceManifestV1> => {
  requireOperationId(operationId);
  const directory = retainMaintenanceDirectory(mediaRoot, false);
  let value: unknown;
  try {
    adapters.afterRetainMaintenanceDirectory?.();
    value = readJson(directory, `${operationId}.manifest.json`, "manifest-not-found", "manifest-invalid");
  } finally {
    releaseDirectoryCapability(directory);
  }
  try {
    const manifest = validateManifest(value, mediaRoot);
    if (manifest.operationId !== operationId) {
      throw new Error("manifest operation ID does not match the requested operation");
    }
    return manifest;
  } catch (error) {
    throw stateError("manifest-invalid", (error as Error).message);
  }
};

export const writeStateAtomic = async (
  mediaRoot: string,
  operationId: string,
  state: MaintenanceStateV1,
  adapters: MaintenanceManifestAdapters = {},
): Promise<void> => {
  requireOperationId(operationId);
  let parsed: MaintenanceStateV1;
  try {
    parsed = validateState(state, operationId);
  } catch (error) {
    throw stateError("state-invalid", (error as Error).message);
  }
  const temporaryName = `.${operationId}.state-${nodeRandomBytes(8).toString("hex")}.tmp`;
  const stateName = `${operationId}.state.json`;
  const directory = retainMaintenanceDirectory(mediaRoot, true);
  let descriptor = -1;
  try {
    adapters.afterRetainMaintenanceDirectory?.();
    assertRetainedDirectoryCapability(directory);
    descriptor = openRelativeFileDescriptor(
      directory,
      temporaryName,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    fchmodSync(descriptor, 0o600);
    requireRegularDescriptor(descriptor, temporaryName);
    writeAll(descriptor, new TextEncoder().encode(`${JSON.stringify(parsed)}\n`));
    fsyncSync(descriptor);
    closeDescriptor(descriptor);
    descriptor = -1;
    try {
      publishRelativeFileNoReplace(directory, temporaryName, stateName);
    } catch {
      try {
        descriptor = openRelativeFileDescriptor(
          directory,
          stateName,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
      } catch {
        throw privatePathError(stateName);
      }
      requireRegularDescriptor(descriptor, stateName);
      closeDescriptor(descriptor);
      descriptor = -1;
      renameRelativeFileReplace(directory, temporaryName, stateName);
    }
    syncRetainedDirectory(directory);
  } catch (error) {
    if (error instanceof MaintenanceStateError && error.code === "private-path-unsafe") {
      throw error;
    }
    throw stateError("state-write-failed", `could not write maintenance state: ${operationId}`);
  } finally {
    closeDescriptor(descriptor);
    try {
      unlinkRelativeFile(directory, temporaryName);
    } catch {
      // The publish/rename path removes the temporary name; retain primary errors.
    }
    releaseDirectoryCapability(directory);
  }
};

export const readState = async (
  mediaRoot: string,
  operationId: string,
  adapters: MaintenanceManifestAdapters = {},
): Promise<MaintenanceStateV1> => {
  requireOperationId(operationId);
  const directory = retainMaintenanceDirectory(mediaRoot, false);
  let value: unknown;
  try {
    adapters.afterRetainMaintenanceDirectory?.();
    value = readJson(directory, `${operationId}.state.json`, "state-not-found", "state-invalid");
  } finally {
    releaseDirectoryCapability(directory);
  }
  try {
    return validateState(value, operationId);
  } catch (error) {
    throw stateError("state-invalid", (error as Error).message);
  }
};

export const sha256File = async (path: string): Promise<string> => {
  const initial = await lstat(path).catch(() => undefined);
  if (!initial?.isFile() || initial.isSymbolicLink()) {
    throw stateError("hash-unsafe-file", `expected a regular non-symlink file: ${path}`);
  }
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== initial.dev || opened.ino !== initial.ino) {
      throw stateError("hash-unsafe-file", `file changed while opening for hashing: ${path}`);
    }
    const hash = new Bun.CryptoHasher("sha256");
    const buffer = new Uint8Array(64 * 1024);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
    return hash.digest("hex");
  } catch (error) {
    if (error instanceof MaintenanceStateError) throw error;
    throw stateError("hash-unsafe-file", `could not safely hash file: ${path}`);
  } finally {
    await handle?.close();
  }
};
