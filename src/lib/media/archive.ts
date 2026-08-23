import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmSync,
  rmdirSync,
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

export type OwnedDirectory = {
  path: string;
  descriptor: number;
  device: number;
  inode: number;
};

export type ArchiveOwnershipReceiver = (owned: OwnedDirectory) => void;

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

const retainOwnedDirectory = (path: string): OwnedDirectory => {
  const descriptor = openSync(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    const info = fstatSync(descriptor);
    if (!info.isDirectory()) {
      throw new Error(`Owned temporary path is not a directory: ${path}`);
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

export const createOwnedDirectory = (
  path: string,
  mode = 0o700,
): OwnedDirectory => {
  mkdirSync(path, { mode });
  try {
    return retainOwnedDirectory(path);
  } catch (error) {
    try {
      rmdirSync(path);
    } catch {
      // The retained capability error is more actionable than best-effort cleanup.
    }
    throw error;
  }
};

const createOwnedTemporaryDirectory = (prefix: string): OwnedDirectory => {
  const path = mkdtempSync(prefix);
  try {
    return retainOwnedDirectory(path);
  } catch (error) {
    try {
      rmdirSync(path);
    } catch {
      // The retained capability error is more actionable than best-effort cleanup.
    }
    throw error;
  }
};

export const releaseOwnedDirectory = (owned: OwnedDirectory): void => {
  if (owned.descriptor < 0) return;
  closeSync(owned.descriptor);
  owned.descriptor = -1;
};

const pathExistsSync = (path: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
};

const ownedDirectoryMatchesPath = (
  owned: OwnedDirectory,
  path: string,
): boolean => {
  const retained = fstatSync(owned.descriptor);
  const candidate = lstatSync(path);
  return (
    retained.isDirectory() &&
    !candidate.isSymbolicLink() &&
    candidate.isDirectory() &&
    retained.dev === owned.device &&
    retained.ino === owned.inode &&
    candidate.dev === owned.device &&
    candidate.ino === owned.inode
  );
};

export const cleanupOwnedDirectory = (owned: OwnedDirectory): void => {
  if (owned.descriptor < 0) return;
  const originalPath = owned.path;
  const quarantinePath = join(
    dirname(originalPath),
    `.${basename(originalPath)}.cleanup-${randomUUID()}`,
  );

  try {
    try {
      publishStagedZipDirectorySync(originalPath, quarantinePath);
    } catch (error) {
      if (!pathExistsSync(originalPath)) return;
      throw error;
    }

    if (!ownedDirectoryMatchesPath(owned, quarantinePath)) {
      publishStagedZipDirectorySync(quarantinePath, originalPath);
      return;
    }

    rmSync(quarantinePath, { recursive: true, force: true });
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
): Promise<ArchiveEntry[]> => {
  const entries = await listZipEntries(source, runner);
  const destinationPath = resolve(destination);
  await ensurePathIsAbsent(destinationPath);
  const staging = createOwnedTemporaryDirectory(
    join(dirname(destinationPath), `.${basename(destinationPath)}.extract-`),
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
    await publish(staging.path, destinationPath);
    staging.path = destinationPath;
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
