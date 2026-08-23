import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { dlopen } from "bun:ffi";
import { type CommandRunner, runCommand } from "./process";

export type ArchiveEntry = {
  path: string;
  isDirectory: boolean;
  selector?: string;
};

export type ZipEntryHeaderProcess = {
  stdout: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill: () => void;
};

export type ZipEntryHeaderSpawner = (argv: string[]) => ZipEntryHeaderProcess;

export type ArchivePublisher = (
  stagingPath: string,
  destinationPath: string,
) => Promise<void>;

export type DirectoryCapability = {
  path: string;
  descriptor: number;
  device: number;
  inode: number;
};

export type OwnedDirectory = {
  path: string;
  descriptor: number;
  device: number;
  inode: number;
  name: string;
  parent: DirectoryCapability;
};

export type ArchiveOwnershipReceiver = (owned: OwnedDirectory) => void;

export type OwnedDirectoryCleanupOptions = {
  afterOwnershipCheck?: (quarantinePath: string) => void;
};

export type OwnedDirectoryPublicationOptions = {
  beforePinnedPublish?: () => void;
};

type ArchiveNativeFfiType =
  | "cstring"
  | "ptr"
  | "i32"
  | "i64"
  | "u32"
  | "u64";

type ArchiveNativeSymbolDefinition = {
  args: ArchiveNativeFfiType[];
  returns: ArchiveNativeFfiType;
};

type ArchiveNativeSymbol = (...args: unknown[]) => unknown;

export type ArchiveNativeLibrary = {
  symbols: Record<string, ArchiveNativeSymbol>;
  close: () => void;
};

export type ArchiveNativeLibraryOpener = (
  libraryName: string,
  symbols: Record<string, ArchiveNativeSymbolDefinition>,
) => ArchiveNativeLibrary;

export type ArchiveNativePublicationOptions = {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  openLibrary?: ArchiveNativeLibraryOpener;
};

const unsafeArchivePath = (): never => {
  throw new Error("unsafe archive path");
};

const archiveCommandError = (
  operation: string,
  exitCode: number,
  stderr = "",
): Error => {
  const detail = stderr.trim();
  return new Error(
    `Unable to ${operation} (exit code ${exitCode})${detail ? `: ${detail}` : ""}`,
  );
};

const isPathInside = (root: string, candidate: string): boolean => {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith(`..${sep}`) &&
      pathFromRoot !== ".." &&
      !isAbsolute(pathFromRoot))
  );
};

const hasErrorCode = (error: unknown, code: string): boolean =>
  error instanceof Error && "code" in error && error.code === code;

const ensurePathIsAbsent = async (path: string): Promise<void> => {
  try {
    await lstat(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return;
    throw error;
  }
  throw new Error("ZIP extraction destination already exists");
};

const noReplacePublishError = (destination: string): Error =>
  new Error(
    `Unable to atomically publish ZIP extraction to "${destination}" without replacing an existing destination.`,
  );

const posixPath = (path: string): Uint8Array =>
  new TextEncoder().encode(`${path}\0`);

const windowsPath = (path: string): Uint16Array => {
  const encoded = new Uint16Array(path.length + 1);
  for (let index = 0; index < path.length; index += 1)
    encoded[index] = path.charCodeAt(index);
  return encoded;
};

const openArchiveNativeLibrary: ArchiveNativeLibraryOpener = (
  libraryName,
  symbols,
) => dlopen(libraryName, symbols) as unknown as ArchiveNativeLibrary;

const linuxLibcNames = (arch: NodeJS.Architecture): string[] => {
  const muslArch =
    arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : null;
  if (muslArch === null) return [];
  return [
    "libc.so.6",
    `libc.musl-${muslArch}.so.1`,
    `/lib/libc.musl-${muslArch}.so.1`,
    `/lib/ld-musl-${muslArch}.so.1`,
  ];
};

const linuxRenameat2Syscall = (arch: NodeJS.Architecture): number | null => {
  if (arch === "x64") return 316;
  if (arch === "arm64") return 276;
  return null;
};

type LinuxNoReplaceOperation = {
  publish: (stagingPath: Uint8Array, destinationPath: Uint8Array) => unknown;
  publishRelative: (
    stagingParentDescriptor: number,
    stagingName: Uint8Array,
    destinationParentDescriptor: number,
    destinationName: Uint8Array,
  ) => unknown;
  close: () => void;
};

const openLinuxNoReplaceOperation = (
  arch: NodeJS.Architecture,
  openLibrary: ArchiveNativeLibraryOpener,
): LinuxNoReplaceOperation => {
  const libraryNames = linuxLibcNames(arch);

  for (const libraryName of libraryNames) {
    try {
      const library = openLibrary(libraryName, {
        renameat2: {
          args: ["i32", "cstring", "i32", "cstring", "u32"],
          returns: "i32",
        },
      });
      return {
        publish: (stagingPath, destinationPath) =>
          library.symbols.renameat2(
            -100,
            stagingPath,
            -100,
            destinationPath,
            1,
          ),
        publishRelative: (
          stagingParentDescriptor,
          stagingName,
          destinationParentDescriptor,
          destinationName,
        ) =>
          library.symbols.renameat2(
            stagingParentDescriptor,
            stagingName,
            destinationParentDescriptor,
            destinationName,
            1,
          ),
        close: () => library.close(),
      };
    } catch {
      // Older glibc releases do not export renameat2; musl uses another soname.
    }
  }

  const syscallNumber = linuxRenameat2Syscall(arch);
  if (syscallNumber !== null) {
    for (const libraryName of libraryNames) {
      try {
        const library = openLibrary(libraryName, {
          syscall: {
            args: ["i64", "i64", "cstring", "i64", "cstring", "u64"],
            returns: "i64",
          },
        });
        return {
          publish: (stagingPath, destinationPath) =>
            library.symbols.syscall(
              syscallNumber,
              -100,
              stagingPath,
              -100,
              destinationPath,
              1,
            ),
          publishRelative: (
            stagingParentDescriptor,
            stagingName,
            destinationParentDescriptor,
            destinationName,
          ) =>
            library.symbols.syscall(
              syscallNumber,
              stagingParentDescriptor,
              stagingName,
              destinationParentDescriptor,
              destinationName,
              1,
            ),
          close: () => library.close(),
        };
      } catch {
        // Keep trying compatible libc names before failing closed.
      }
    }
  }

  throw new Error("No compatible Linux no-replace rename primitive");
};

const nativeCallSucceeded = (result: unknown): boolean =>
  result === 0 || result === 0n;

const publishStagedZipDirectorySync = (
  stagingPath: string,
  destinationPath: string,
  options: ArchiveNativePublicationOptions = {},
): void => {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const openLibrary = options.openLibrary ?? openArchiveNativeLibrary;

  try {
    if (platform === "darwin") {
      const library = openLibrary("/usr/lib/libSystem.B.dylib", {
        renamex_np: { args: ["cstring", "cstring", "u32"], returns: "i32" },
      });
      try {
        if (
          !nativeCallSucceeded(
            library.symbols.renamex_np(
              posixPath(stagingPath),
              posixPath(destinationPath),
              0x00000004,
            ),
          )
        ) {
          throw noReplacePublishError(destinationPath);
        }
        return;
      } finally {
        library.close();
      }
    }

    if (platform === "linux") {
      const operation = openLinuxNoReplaceOperation(arch, openLibrary);
      try {
        if (
          !nativeCallSucceeded(
            operation.publish(
              posixPath(stagingPath),
              posixPath(destinationPath),
            ),
          )
        ) {
          throw noReplacePublishError(destinationPath);
        }
        return;
      } finally {
        operation.close();
      }
    }

    if (platform === "win32") {
      const library = openLibrary("kernel32.dll", {
        MoveFileW: { args: ["ptr", "ptr"], returns: "i32" },
      });
      try {
        const result = library.symbols.MoveFileW(
          windowsPath(stagingPath),
          windowsPath(destinationPath),
        );
        if (typeof result !== "number" || result === 0) {
          throw noReplacePublishError(destinationPath);
        }
        return;
      } finally {
        library.close();
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Unable to atomically publish ZIP extraction")
    )
      throw error;
    throw new Error(
      `Atomic no-replace ZIP publication is unavailable on ${platform}.`,
    );
  }

  throw new Error(
    `Atomic no-replace ZIP publication is unavailable on ${platform}.`,
  );
};

export const publishStagedZipDirectory = async (
  stagingPath: string,
  destinationPath: string,
  options: ArchiveNativePublicationOptions = {},
): Promise<void> => {
  publishStagedZipDirectorySync(stagingPath, destinationPath, options);
};

const directoryOpenFlags =
  constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW;

const publishRelativeNoReplaceSync = (
  parentDescriptor: number,
  stagingName: string,
  destinationName: string,
  destinationDisplay = destinationName,
): void => {
  const destination = destinationDisplay;
  try {
    if (process.platform === "darwin") {
      const library = openArchiveNativeLibrary("/usr/lib/libSystem.B.dylib", {
        renameatx_np: {
          args: ["i32", "cstring", "i32", "cstring", "u32"],
          returns: "i32",
        },
      });
      try {
        if (
          !nativeCallSucceeded(
            library.symbols.renameatx_np(
              parentDescriptor,
              posixPath(stagingName),
              parentDescriptor,
              posixPath(destinationName),
              0x00000004,
            ),
          )
        ) {
          throw noReplacePublishError(destination);
        }
        return;
      } finally {
        library.close();
      }
    }

    if (process.platform === "linux") {
      const operation = openLinuxNoReplaceOperation(
        process.arch,
        openArchiveNativeLibrary,
      );
      try {
        if (
          !nativeCallSucceeded(
            operation.publishRelative(
              parentDescriptor,
              posixPath(stagingName),
              parentDescriptor,
              posixPath(destinationName),
            ),
          )
        ) {
          throw noReplacePublishError(destination);
        }
        return;
      } finally {
        operation.close();
      }
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Unable to atomically publish ZIP extraction")
    ) {
      throw error;
    }
    throw new Error(
      `Capability-bound no-replace directory publication is unavailable on ${process.platform}.`,
    );
  }

  throw new Error(
    `Capability-bound no-replace directory publication is unavailable on ${process.platform}.`,
  );
};

const openRelativeDirectorySync = (
  parentDescriptor: number,
  name: string,
): number => {
  const libraries =
    process.platform === "darwin"
      ? ["/usr/lib/libSystem.B.dylib"]
      : process.platform === "linux"
        ? linuxLibcNames(process.arch)
        : [];
  for (const libraryName of libraries) {
    let library: ArchiveNativeLibrary | undefined;
    try {
      library = openArchiveNativeLibrary(libraryName, {
        openat: {
          args: ["i32", "cstring", "i32"],
          returns: "i32",
        },
      });
      const descriptor = library.symbols.openat(
        parentDescriptor,
        posixPath(name),
        directoryOpenFlags,
      );
      if (typeof descriptor === "number" && descriptor >= 0) return descriptor;
    } catch {
      // Try the next compatible native library before failing closed.
    } finally {
      library?.close();
    }
  }
  throw new Error(
    `Capability-bound directory access is unavailable on ${process.platform}.`,
  );
};

const removeRelativeDirectoryRecursiveSync = (
  parentDescriptor: number,
  name: string,
): void => {
  if (process.platform === "darwin") {
    const library = openArchiveNativeLibrary("/usr/lib/libSystem.B.dylib", {
      removefileat: {
        args: ["i32", "cstring", "ptr", "u32"],
        returns: "i32",
      },
    });
    try {
      if (
        !nativeCallSucceeded(
          library.symbols.removefileat(
            parentDescriptor,
            posixPath(name),
            null,
            1,
          ),
        )
      ) {
        throw new Error(`Unable to remove owned temporary directory: ${name}`);
      }
      return;
    } finally {
      library.close();
    }
  }

  if (process.platform === "linux") {
    rmSync(join(`/proc/self/fd/${parentDescriptor}`, name), {
      recursive: true,
      force: true,
    });
    return;
  }

  throw new Error(
    `Capability-bound directory cleanup is unavailable on ${process.platform}.`,
  );
};

const makeRelativeDirectorySync = (
  parentDescriptor: number,
  name: string,
  mode: number,
): void => {
  const libraries =
    process.platform === "darwin"
      ? ["/usr/lib/libSystem.B.dylib"]
      : process.platform === "linux"
        ? linuxLibcNames(process.arch)
        : [];
  for (const libraryName of libraries) {
    let library: ArchiveNativeLibrary | undefined;
    try {
      library = openArchiveNativeLibrary(libraryName, {
        mkdirat: {
          args: ["i32", "cstring", "u32"],
          returns: "i32",
        },
      });
      if (
        nativeCallSucceeded(
          library.symbols.mkdirat(
            parentDescriptor,
            posixPath(name),
            mode,
          ),
        )
      ) {
        return;
      }
    } catch {
      // Try the next compatible native library before failing closed.
    } finally {
      library?.close();
    }
  }
  throw new Error(
    `Capability-bound directory creation is unavailable on ${process.platform}.`,
  );
};

export const retainDirectoryCapability = (
  path: string,
): DirectoryCapability => {
  const descriptor = openSync(path, directoryOpenFlags);
  try {
    const info = fstatSync(descriptor);
    if (!info.isDirectory()) {
      throw new Error(`Retained path is not a directory: ${path}`);
    }
    return {
      path,
      descriptor,
      device: info.dev,
      inode: info.ino,
    };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
};

export const releaseDirectoryCapability = (
  capability: DirectoryCapability,
): void => {
  if (capability.descriptor < 0) return;
  closeSync(capability.descriptor);
  capability.descriptor = -1;
};

const cloneDirectoryCapability = (
  capability: DirectoryCapability,
): DirectoryCapability => {
  const descriptor = openRelativeDirectorySync(capability.descriptor, ".");
  try {
    const info = fstatSync(descriptor);
    return {
      path: capability.path,
      descriptor,
      device: info.dev,
      inode: info.ino,
    };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
};

const retainOwnedDirectory = (
  path: string,
  retainedParent?: DirectoryCapability,
): OwnedDirectory => {
  const parent =
    retainedParent ?? retainDirectoryCapability(realpathSync(dirname(path)));
  const name = basename(path);
  let descriptor = -1;
  try {
    descriptor = openRelativeDirectorySync(parent.descriptor, name);
    const info = fstatSync(descriptor);
    if (!info.isDirectory()) {
      throw new Error(`Owned temporary path is not a directory: ${path}`);
    }
    return {
      path: join(parent.path, name),
      descriptor,
      device: info.dev,
      inode: info.ino,
      name,
      parent,
    };
  } catch (error) {
    if (descriptor >= 0) closeSync(descriptor);
    releaseDirectoryCapability(parent);
    throw error;
  }
};

export const createOwnedDirectory = (
  path: string,
  mode = 0o700,
): OwnedDirectory => {
  const parent = retainDirectoryCapability(realpathSync(dirname(path)));
  try {
    return createOwnedDirectoryAt(parent, basename(path), mode);
  } finally {
    releaseDirectoryCapability(parent);
  }
};

export const createOwnedDirectoryAt = (
  parent: DirectoryCapability,
  name: string,
  mode = 0o700,
): OwnedDirectory => {
  if (name !== basename(name) || name === "." || name === "..") {
    throw new Error(`Unsafe owned directory name: ${name}`);
  }
  const ownedParent = cloneDirectoryCapability(parent);
  let created = false;
  try {
    makeRelativeDirectorySync(parent.descriptor, name, mode);
    created = true;
    return retainOwnedDirectory(join(ownedParent.path, name), ownedParent);
  } catch (error) {
    if (created) {
      try {
        removeRelativeDirectoryRecursiveSync(parent.descriptor, name);
      } catch {
        // The retained capability error is more actionable than cleanup failure.
      }
    }
    releaseDirectoryCapability(ownedParent);
    throw error;
  }
};

const createOwnedTemporaryDirectory = (
  prefix: string,
  retainedParent?: DirectoryCapability,
): OwnedDirectory => {
  const parent =
    retainedParent ?? retainDirectoryCapability(realpathSync(dirname(prefix)));
  try {
    return createOwnedDirectoryAt(
      parent,
      `${basename(prefix)}${randomUUID()}`,
    );
  } finally {
    if (!retainedParent) releaseDirectoryCapability(parent);
  }
};

export const releaseOwnedDirectory = (owned: OwnedDirectory): void => {
  if (owned.descriptor < 0) return;
  closeSync(owned.descriptor);
  owned.descriptor = -1;
  if (owned.parent.descriptor >= 0) {
    closeSync(owned.parent.descriptor);
    owned.parent.descriptor = -1;
  }
};

const directoryCapabilityNamesPath = (
  capability: DirectoryCapability,
): boolean => {
  try {
    const retained = fstatSync(capability.descriptor);
    const candidate = lstatSync(capability.path);
    return (
      retained.isDirectory() &&
      !candidate.isSymbolicLink() &&
      candidate.isDirectory() &&
      retained.dev === capability.device &&
      retained.ino === capability.inode &&
      candidate.dev === capability.device &&
      candidate.ino === capability.inode
    );
  } catch {
    return false;
  }
};

const ownedDirectoryMatchesRelativeName = (
  owned: OwnedDirectory,
  name: string,
): boolean => {
  let candidateDescriptor = -1;
  try {
    const retained = fstatSync(owned.descriptor);
    candidateDescriptor = openRelativeDirectorySync(
      owned.parent.descriptor,
      name,
    );
    const candidate = fstatSync(candidateDescriptor);
    return (
      retained.isDirectory() &&
      candidate.isDirectory() &&
      retained.dev === owned.device &&
      retained.ino === owned.inode &&
      candidate.dev === owned.device &&
      candidate.ino === owned.inode
    );
  } catch {
    return false;
  } finally {
    if (candidateDescriptor >= 0) closeSync(candidateDescriptor);
  }
};

const setOwnedDirectoryName = (owned: OwnedDirectory, name: string): void => {
  owned.name = name;
  owned.path = join(owned.parent.path, name);
};

const restoreRelativeName = (
  owned: OwnedDirectory,
  currentName: string,
  originalName: string,
): void => {
  try {
    publishRelativeNoReplaceSync(
      owned.parent.descriptor,
      currentName,
      originalName,
    );
  } catch {
    // Preserve the isolated entry if its original name was concurrently reused.
  }
  setOwnedDirectoryName(owned, originalName);
};

const isolateOwnedDirectory = (
  owned: OwnedDirectory,
  purpose: "cleanup" | "publish",
): string => {
  const originalName = owned.name;
  const isolatedName = `.${originalName}.${purpose}-${randomUUID()}`;
  publishRelativeNoReplaceSync(
    owned.parent.descriptor,
    originalName,
    isolatedName,
  );
  setOwnedDirectoryName(owned, isolatedName);

  if (!ownedDirectoryMatchesRelativeName(owned, isolatedName)) {
    restoreRelativeName(owned, isolatedName, originalName);
    throw new Error(`Owned staging changed before ${purpose}: ${owned.path}`);
  }
  return isolatedName;
};

export const publishOwnedDirectory = (
  owned: OwnedDirectory,
  destinationPath: string,
  options: OwnedDirectoryPublicationOptions = {},
): void => {
  const requestedDestination = resolve(destinationPath);
  let destinationParent: string;
  try {
    destinationParent = realpathSync(dirname(requestedDestination));
  } catch {
    destinationParent = dirname(requestedDestination);
  }
  const destination = join(
    owned.parent.path,
    basename(requestedDestination),
  );
  if (
    destinationParent !== owned.parent.path ||
    basename(destination) === "" ||
    basename(destination).includes(sep)
  ) {
    throw new Error(
      `Owned publication destination is outside its retained parent: ${destination}`,
    );
  }

  options.beforePinnedPublish?.();
  if (!directoryCapabilityNamesPath(owned.parent)) {
    throw new Error(
      `Optimization destination parent changed during execution: ${owned.parent.path}`,
    );
  }

  const isolatedName = isolateOwnedDirectory(owned, "publish");
  const destinationName = basename(destination);
  publishRelativeNoReplaceSync(
    owned.parent.descriptor,
    isolatedName,
    destinationName,
    destination,
  );
  setOwnedDirectoryName(owned, destinationName);

  if (!directoryCapabilityNamesPath(owned.parent)) {
    try {
      cleanupOwnedDirectory(owned);
    } catch {
      // Retain the parent-identity failure as the primary transaction error.
    }
    throw new Error(
      `Optimization destination parent changed during execution: ${owned.parent.path}`,
    );
  }
};

export const cleanupOwnedDirectory = (
  owned: OwnedDirectory,
  options: OwnedDirectoryCleanupOptions = {},
): void => {
  if (owned.descriptor < 0) return;

  try {
    if (process.platform !== "darwin" && process.platform !== "linux") {
      throw new Error(
        `Capability-bound directory cleanup is unavailable on ${process.platform}.`,
      );
    }
    if (!ownedDirectoryMatchesRelativeName(owned, owned.name)) {
      return;
    }
    const quarantineName = isolateOwnedDirectory(owned, "cleanup");
    const quarantinePath = owned.path;

    options.afterOwnershipCheck?.(quarantinePath);

    const sealedName = `.${quarantineName}.sealed-${randomUUID()}`;
    publishRelativeNoReplaceSync(
      owned.parent.descriptor,
      quarantineName,
      sealedName,
    );
    setOwnedDirectoryName(owned, sealedName);
    if (!ownedDirectoryMatchesRelativeName(owned, sealedName)) {
      restoreRelativeName(owned, sealedName, quarantineName);
      return;
    }

    removeRelativeDirectoryRecursiveSync(
      owned.parent.descriptor,
      sealedName,
    );
  } finally {
    releaseOwnedDirectory(owned);
  }
};

export const validateArchiveEntryPath = (entryPath: string): string => {
  if (
    typeof entryPath !== "string" ||
    entryPath.length === 0 ||
    /[\0\r\n\\]/.test(entryPath) ||
    entryPath.startsWith("/") ||
    entryPath.startsWith("-") ||
    /[*?\[\]]/.test(entryPath) ||
    /^[A-Za-z]:/.test(entryPath)
  ) {
    return unsafeArchivePath();
  }

  const isDirectory = entryPath.endsWith("/");
  const segments = entryPath.split("/");
  if (segments.some((segment) => segment === "..")) return unsafeArchivePath();

  const normalized = segments
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
  if (!isDirectory && normalized.length === 0) return unsafeArchivePath();
  return isDirectory && normalized.length > 0 ? `${normalized}/` : normalized;
};

export const listZipEntries = async (
  source: string,
  runner: CommandRunner = runCommand,
): Promise<ArchiveEntry[]> => {
  const result = await runner(["unzip", "-Z1", source]);
  if (result.exitCode !== 0)
    throw archiveCommandError(
      "list ZIP archive",
      result.exitCode,
      result.stderr,
    );

  const output = new TextDecoder().decode(result.stdout);
  if (output.length === 0) return [];
  const lines = output.endsWith("\n")
    ? output.slice(0, -1).split("\n")
    : output.split("\n");
  return lines.map((entryPath) => {
    const path = validateArchiveEntryPath(entryPath);
    return { path, selector: entryPath, isDirectory: entryPath.endsWith("/") };
  });
};

const spawnZipEntryHeader: ZipEntryHeaderSpawner = (argv) =>
  Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "ignore",
  }) as ZipEntryHeaderProcess;

export const readZipEntryHeader = async (
  source: string,
  entry: ArchiveEntry | string,
  spawn: ZipEntryHeaderSpawner = spawnZipEntryHeader,
): Promise<Uint8Array> => {
  const selector =
    typeof entry === "string" ? entry : (entry.selector ?? entry.path);
  validateArchiveEntryPath(selector);
  const child = spawn(["unzip", "-p", source, selector]);
  const reader = child.stdout.getReader();

  try {
    let firstChunk: Awaited<ReturnType<typeof reader.read>>;
    try {
      firstChunk = await reader.read();
    } catch (error) {
      try {
        child.kill();
      } catch {
        // Killing an already-exited child is harmless.
      }
      let exitCode: number | undefined;
      try {
        exitCode = await child.exited;
      } catch {
        // Preserve stream errors when the process status is unavailable.
      }
      if (exitCode !== undefined && exitCode !== 0)
        throw archiveCommandError("read ZIP entry header", exitCode);
      throw error;
    }
    if (firstChunk.done) {
      const exitCode = await child.exited;
      if (exitCode !== 0)
        throw archiveCommandError("read ZIP entry header", exitCode);
      return new Uint8Array();
    }
    return firstChunk.value.slice(0, 32);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // The process may already have closed its output stream.
    }
    reader.releaseLock();
    try {
      child.kill();
    } catch {
      // Killing an already-exited child is harmless.
    }
    try {
      await child.exited;
    } catch {
      // Bun reports process status through the exit code, not promise rejection.
    }
  }
};

const verifyExtractedTree = async (destination: string): Promise<void> => {
  const destinationInfo = await lstat(destination);
  if (destinationInfo.isSymbolicLink() || !destinationInfo.isDirectory()) {
    throw new Error("Unsafe ZIP extraction destination");
  }

  const resolvedDestination = await realpath(destination);
  const walk = async (directory: string): Promise<void> => {
    for (const name of await readdir(directory)) {
      const candidate = resolve(directory, name);
      if (!isPathInside(destination, candidate))
        throw new Error("ZIP extraction escaped its destination");

      const info = await lstat(candidate);
      if (info.isSymbolicLink())
        throw new Error("ZIP extraction contains a symbolic link");
      if (!info.isDirectory() && !info.isFile())
        throw new Error("ZIP extraction contains an unsafe special file");

      const resolvedCandidate = await realpath(candidate);
      if (!isPathInside(resolvedDestination, resolvedCandidate)) {
        throw new Error("ZIP extraction escaped its destination");
      }
      if (info.isDirectory()) await walk(candidate);
    }
  };

  await walk(destination);
};

export const extractZipArchive = async (
  source: string,
  destination: string,
  runner: CommandRunner = runCommand,
  publish: ArchivePublisher = publishStagedZipDirectory,
  receiveOwnership?: ArchiveOwnershipReceiver,
  retainedParent?: DirectoryCapability,
): Promise<ArchiveEntry[]> => {
  const entries = await listZipEntries(source, runner);
  const destinationPath = resolve(destination);
  await ensurePathIsAbsent(destinationPath);
  const staging = createOwnedTemporaryDirectory(
    join(dirname(destinationPath), `.${basename(destinationPath)}.extract-`),
    retainedParent,
  );

  try {
    const result = await runner(["unzip", "-qq", source, "-d", staging.path]);
    if (result.exitCode !== 0)
      throw archiveCommandError(
        "extract ZIP archive",
        result.exitCode,
        result.stderr,
      );

    await verifyExtractedTree(staging.path);
    if (publish === publishStagedZipDirectory) {
      publishOwnedDirectory(staging, destinationPath);
    } else {
      isolateOwnedDirectory(staging, "publish");
      await publish(staging.path, destinationPath);
      setOwnedDirectoryName(staging, basename(destinationPath));
      if (!ownedDirectoryMatchesRelativeName(staging, staging.name)) {
        throw new Error(
          `Owned staging changed before publication: ${destinationPath}`,
        );
      }
    }
    if (receiveOwnership) receiveOwnership(staging);
    else releaseOwnedDirectory(staging);
    return entries;
  } catch (error) {
    try {
      cleanupOwnedDirectory(staging);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "ZIP extraction failed and its staging directory could not be removed",
      );
    }
    throw error;
  }
};
