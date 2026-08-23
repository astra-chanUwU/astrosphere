import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
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
import { dlopen, toArrayBuffer } from "bun:ffi";
import { type CommandOptions, type CommandRunner, runCommand } from "./process";

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

export type ZipEntryHeaderSpawner = (
  argv: string[],
  options?: CommandOptions,
) => ZipEntryHeaderProcess;

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

export type RetainedArchiveFile = {
  descriptor: number;
  bytes: number;
};

export type RetainedOutputFile = RetainedArchiveFile;

type ArchiveNativeFfiType = "cstring" | "ptr" | "i32" | "i64" | "u32" | "u64";

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

const openRelativeDescriptorSync = (
  parentDescriptor: number,
  name: string,
  flags: number,
  mode = 0,
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
          args: ["i32", "cstring", "i32", "u32"],
          returns: "i32",
        },
      });
      const descriptor = library.symbols.openat(
        parentDescriptor,
        posixPath(name),
        flags,
        mode,
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

const openRelativeDirectorySync = (
  parentDescriptor: number,
  name: string,
): number =>
  openRelativeDescriptorSync(parentDescriptor, name, directoryOpenFlags);

const removeRelativeDirectoryRecursiveSync = (
  parentDescriptor: number,
  name: string,
): void => {
  const libraryNames =
    process.platform === "darwin"
      ? ["/usr/lib/libSystem.B.dylib"]
      : process.platform === "linux"
        ? linuxLibcNames(process.arch)
        : [];
  const removeDirectoryFlag = process.platform === "darwin" ? 0x80 : 0x200;

  for (const libraryName of libraryNames) {
    let library: ArchiveNativeLibrary | undefined;
    try {
      library = openArchiveNativeLibrary(libraryName, {
        dup: { args: ["i32"], returns: "i32" },
        fdopendir: { args: ["i32"], returns: "ptr" },
        readdir: { args: ["ptr"], returns: "ptr" },
        closedir: { args: ["ptr"], returns: "i32" },
        unlinkat: { args: ["i32", "cstring", "i32"], returns: "i32" },
      });

      const readNames = (descriptor: number): string[] => {
        const duplicate = library!.symbols.dup(descriptor);
        if (typeof duplicate !== "number" || duplicate < 0) {
          throw new Error("Unable to duplicate owned directory descriptor");
        }
        const directory = library!.symbols.fdopendir(duplicate);
        if (!directory) {
          closeSync(duplicate);
          throw new Error("Unable to enumerate owned directory descriptor");
        }
        try {
          const names: string[] = [];
          while (true) {
            const entry = library!.symbols.readdir(directory);
            if (!entry) return names;
            const record = new Uint8Array(
              toArrayBuffer(
                entry as never,
                0,
                process.platform === "darwin" ? 1048 : 280,
              ),
            );
            const nameOffset = process.platform === "darwin" ? 21 : 19;
            let nameLength = 0;
            while (
              nameOffset + nameLength < record.byteLength &&
              record[nameOffset + nameLength] !== 0
            ) {
              nameLength += 1;
            }
            const entryName = new TextDecoder().decode(
              record.subarray(nameOffset, nameOffset + nameLength),
            );
            if (entryName !== "." && entryName !== "..") names.push(entryName);
          }
        } finally {
          library!.symbols.closedir(directory);
        }
      };

      const unlinkRelative = (
        descriptor: number,
        entryName: string,
        flags: number,
      ): void => {
        if (
          !nativeCallSucceeded(
            library!.symbols.unlinkat(descriptor, posixPath(entryName), flags),
          )
        ) {
          throw new Error(
            `Unable to remove owned temporary entry: ${entryName}`,
          );
        }
      };

      const emptyDirectory = (descriptor: number): void => {
        for (const entryName of readNames(descriptor)) {
          let childDescriptor = -1;
          try {
            childDescriptor = openRelativeDirectorySync(descriptor, entryName);
          } catch {
            unlinkRelative(descriptor, entryName, 0);
            continue;
          }
          try {
            emptyDirectory(childDescriptor);
            const retained = fstatSync(childDescriptor);
            let namedDescriptor = -1;
            try {
              namedDescriptor = openRelativeDirectorySync(
                descriptor,
                entryName,
              );
              const named = fstatSync(namedDescriptor);
              if (retained.dev !== named.dev || retained.ino !== named.ino) {
                throw new Error("Owned cleanup entry changed during removal");
              }
            } finally {
              if (namedDescriptor >= 0) closeSync(namedDescriptor);
            }
            unlinkRelative(descriptor, entryName, removeDirectoryFlag);
          } finally {
            closeSync(childDescriptor);
          }
        }
        if (readNames(descriptor).length !== 0) {
          throw new Error("Owned temporary directory changed during cleanup");
        }
      };

      const directoryDescriptor = openRelativeDirectorySync(
        parentDescriptor,
        name,
      );
      try {
        emptyDirectory(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
      unlinkRelative(parentDescriptor, name, removeDirectoryFlag);
      return;
    } catch {
      // Try the next compatible native library before failing closed.
    } finally {
      library?.close();
    }
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
          library.symbols.mkdirat(parentDescriptor, posixPath(name), mode),
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

const relativeCapabilityName = (name: string): void => {
  if (
    name.length === 0 ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0")
  ) {
    throw new Error(`Unsafe capability-relative entry name: ${name}`);
  }
};

export const assertRetainedDirectoryCapability = (
  capability: DirectoryCapability,
): void => {
  const info = fstatSync(capability.descriptor);
  if (
    !info.isDirectory() ||
    info.dev !== capability.device ||
    info.ino !== capability.inode
  ) {
    throw new Error(`Retained directory changed: ${capability.path}`);
  }
};

export const retainRelativeDirectoryCapability = (
  parent: DirectoryCapability,
  name: string,
): DirectoryCapability => {
  relativeCapabilityName(name);
  assertRetainedDirectoryCapability(parent);
  const descriptor = openRelativeDirectorySync(parent.descriptor, name);
  try {
    const info = fstatSync(descriptor);
    if (!info.isDirectory()) {
      throw new Error(`Retained relative path is not a directory: ${name}`);
    }
    return {
      path: join(parent.path, name),
      descriptor,
      device: info.dev,
      inode: info.ino,
    };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
};

export const createOrRetainRelativeDirectoryCapability = (
  parent: DirectoryCapability,
  name: string,
  mode = 0o700,
): DirectoryCapability => {
  try {
    return retainRelativeDirectoryCapability(parent, name);
  } catch {
    relativeCapabilityName(name);
    assertRetainedDirectoryCapability(parent);
    makeRelativeDirectorySync(parent.descriptor, name, mode);
    return retainRelativeDirectoryCapability(parent, name);
  }
};

export const openRelativeFileDescriptor = (
  parent: DirectoryCapability,
  name: string,
  flags: number,
  mode = 0,
): number => {
  relativeCapabilityName(name);
  assertRetainedDirectoryCapability(parent);
  return openRelativeDescriptorSync(parent.descriptor, name, flags, mode);
};

export const relativeDirectoryEntryExists = (
  parent: DirectoryCapability,
  name: string,
): boolean => {
  relativeCapabilityName(name);
  assertRetainedDirectoryCapability(parent);
  const libraries =
    process.platform === "darwin"
      ? ["/usr/lib/libSystem.B.dylib"]
      : process.platform === "linux"
        ? linuxLibcNames(process.arch)
        : [];
  for (const libraryName of libraries) {
    let library: ArchiveNativeLibrary | undefined;
    let descriptor = -1;
    try {
      library = openArchiveNativeLibrary(libraryName, {
        fdopendir: { args: ["i32"], returns: "ptr" },
        readdir: { args: ["ptr"], returns: "ptr" },
        closedir: { args: ["ptr"], returns: "i32" },
      });
      descriptor = openRelativeDirectorySync(parent.descriptor, ".");
      const directory = library.symbols.fdopendir(descriptor);
      if (!directory) throw new Error("Unable to enumerate retained directory");
      descriptor = -1;
      try {
        while (true) {
          const entry = library.symbols.readdir(directory);
          if (!entry) return false;
          const record = new Uint8Array(
            toArrayBuffer(
              entry as never,
              0,
              process.platform === "darwin" ? 1048 : 280,
            ),
          );
          const nameOffset = process.platform === "darwin" ? 21 : 19;
          let nameLength = 0;
          while (
            nameOffset + nameLength < record.byteLength &&
            record[nameOffset + nameLength] !== 0
          ) {
            nameLength += 1;
          }
          const entryName = new TextDecoder().decode(
            record.subarray(nameOffset, nameOffset + nameLength),
          );
          if (entryName === name) return true;
        }
      } finally {
        library.symbols.closedir(directory);
      }
    } catch {
      // Try the next compatible native library before failing closed.
    } finally {
      if (descriptor >= 0) closeSync(descriptor);
      library?.close();
    }
  }
  throw new Error(
    `Capability-bound directory enumeration is unavailable on ${process.platform}.`,
  );
};

export const publishRelativeFileNoReplace = (
  parent: DirectoryCapability,
  stagingName: string,
  destinationName: string,
): void => {
  relativeCapabilityName(stagingName);
  relativeCapabilityName(destinationName);
  assertRetainedDirectoryCapability(parent);
  publishRelativeNoReplaceSync(parent.descriptor, stagingName, destinationName);
};

export const linkRelativeFileNoReplace = (
  sourceParent: DirectoryCapability,
  sourceName: string,
  destinationParent: DirectoryCapability,
  destinationName: string,
): void => {
  relativeCapabilityName(sourceName);
  relativeCapabilityName(destinationName);
  assertRetainedDirectoryCapability(sourceParent);
  assertRetainedDirectoryCapability(destinationParent);
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
        linkat: {
          args: ["i32", "cstring", "i32", "cstring", "i32"],
          returns: "i32",
        },
      });
      if (
        nativeCallSucceeded(
          library.symbols.linkat(
            sourceParent.descriptor,
            posixPath(sourceName),
            destinationParent.descriptor,
            posixPath(destinationName),
            0,
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
    `Capability-bound no-replace hard-link publication is unavailable on ${process.platform}.`,
  );
};

export const renameRelativeFileReplace = (
  parent: DirectoryCapability,
  sourceName: string,
  destinationName: string,
): void => {
  relativeCapabilityName(sourceName);
  relativeCapabilityName(destinationName);
  assertRetainedDirectoryCapability(parent);
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
        renameat: {
          args: ["i32", "cstring", "i32", "cstring"],
          returns: "i32",
        },
      });
      if (
        nativeCallSucceeded(
          library.symbols.renameat(
            parent.descriptor,
            posixPath(sourceName),
            parent.descriptor,
            posixPath(destinationName),
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
    `Capability-bound relative rename is unavailable on ${process.platform}.`,
  );
};

export const exchangeRelativeFiles = (
  parent: DirectoryCapability,
  firstName: string,
  secondName: string,
): void => {
  relativeCapabilityName(firstName);
  relativeCapabilityName(secondName);
  assertRetainedDirectoryCapability(parent);
  if (process.platform === "darwin") {
    let library: ArchiveNativeLibrary | undefined;
    try {
      library = openArchiveNativeLibrary("/usr/lib/libSystem.B.dylib", {
        renameatx_np: {
          args: ["i32", "cstring", "i32", "cstring", "u32"],
          returns: "i32",
        },
      });
      if (
        nativeCallSucceeded(
          library.symbols.renameatx_np(
            parent.descriptor,
            posixPath(firstName),
            parent.descriptor,
            posixPath(secondName),
            0x00000002,
          ),
        )
      ) {
        return;
      }
    } catch {
      // Fail closed below.
    } finally {
      library?.close();
    }
  }
  if (process.platform === "linux") {
    for (const libraryName of linuxLibcNames(process.arch)) {
      let library: ArchiveNativeLibrary | undefined;
      try {
        library = openArchiveNativeLibrary(libraryName, {
          renameat2: {
            args: ["i32", "cstring", "i32", "cstring", "u32"],
            returns: "i32",
          },
        });
        if (
          nativeCallSucceeded(
            library.symbols.renameat2(
              parent.descriptor,
              posixPath(firstName),
              parent.descriptor,
              posixPath(secondName),
              2,
            ),
          )
        ) {
          return;
        }
      } catch {
        // Try compatible libc names and then the direct syscall.
      } finally {
        library?.close();
      }
    }
    const syscallNumber = linuxRenameat2Syscall(process.arch);
    if (syscallNumber !== null) {
      for (const libraryName of linuxLibcNames(process.arch)) {
        let library: ArchiveNativeLibrary | undefined;
        try {
          library = openArchiveNativeLibrary(libraryName, {
            syscall: {
              args: ["i64", "i64", "cstring", "i64", "cstring", "u64"],
              returns: "i64",
            },
          });
          if (
            nativeCallSucceeded(
              library.symbols.syscall(
                syscallNumber,
                parent.descriptor,
                posixPath(firstName),
                parent.descriptor,
                posixPath(secondName),
                2,
              ),
            )
          ) {
            return;
          }
        } catch {
          // Try the next compatible libc name before failing closed.
        } finally {
          library?.close();
        }
      }
    }
  }
  throw new Error(
    `Capability-bound atomic file exchange is unavailable on ${process.platform}.`,
  );
};

export const unlinkRelativeFile = (
  parent: DirectoryCapability,
  name: string,
): void => {
  relativeCapabilityName(name);
  assertRetainedDirectoryCapability(parent);
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
        unlinkat: { args: ["i32", "cstring", "i32"], returns: "i32" },
      });
      if (
        nativeCallSucceeded(
          library.symbols.unlinkat(parent.descriptor, posixPath(name), 0),
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
    `Capability-bound relative unlink is unavailable on ${process.platform}.`,
  );
};

export const removeRelativeDirectory = (
  parent: DirectoryCapability,
  name: string,
): void => {
  relativeCapabilityName(name);
  assertRetainedDirectoryCapability(parent);
  const libraries =
    process.platform === "darwin"
      ? ["/usr/lib/libSystem.B.dylib"]
      : process.platform === "linux"
        ? linuxLibcNames(process.arch)
        : [];
  const removeDirectoryFlag = process.platform === "darwin" ? 0x80 : 0x200;
  for (const libraryName of libraries) {
    let library: ArchiveNativeLibrary | undefined;
    try {
      library = openArchiveNativeLibrary(libraryName, {
        unlinkat: { args: ["i32", "cstring", "i32"], returns: "i32" },
      });
      if (
        nativeCallSucceeded(
          library.symbols.unlinkat(
            parent.descriptor,
            posixPath(name),
            removeDirectoryFlag,
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
    `Capability-bound relative directory removal is unavailable on ${process.platform}.`,
  );
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
    return createOwnedDirectoryAt(parent, `${basename(prefix)}${randomUUID()}`);
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
  purpose: "cleanup" | "publish" | "read",
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

export const sealOwnedDirectoryForRead = (owned: OwnedDirectory): void => {
  isolateOwnedDirectory(owned, "read");
};

export const retainOwnedArchiveFile = (
  owned: OwnedDirectory,
  relativePath: string,
): RetainedArchiveFile => {
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes("\\")
  ) {
    throw new Error(`Unsafe retained archive path: ${relativePath}`);
  }
  const segments = relativePath.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`Unsafe retained archive path: ${relativePath}`);
  }

  let parentDescriptor = owned.descriptor;
  let openedParent = -1;
  try {
    for (const segment of segments.slice(0, -1)) {
      const nextParent = openRelativeDirectorySync(parentDescriptor, segment);
      if (openedParent >= 0) closeSync(openedParent);
      openedParent = nextParent;
      parentDescriptor = nextParent;
    }

    const descriptor = openRelativeDescriptorSync(
      parentDescriptor,
      segments.at(-1)!,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const info = fstatSync(descriptor);
      if (!info.isFile()) {
        throw new Error(
          `Retained archive entry is not a file: ${relativePath}`,
        );
      }
      return { descriptor, bytes: info.size };
    } catch (error) {
      closeSync(descriptor);
      throw error;
    }
  } finally {
    if (openedParent >= 0) closeSync(openedParent);
  }
};

export const retainOwnedOutputFile = (
  owned: OwnedDirectory,
  relativePath: string,
): RetainedOutputFile => {
  if (
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.includes("\\")
  ) {
    throw new Error(`Unsafe retained output path: ${relativePath}`);
  }
  const segments = relativePath.split("/");
  if (
    segments.some(
      (segment) => segment.length === 0 || segment === "." || segment === "..",
    )
  ) {
    throw new Error(`Unsafe retained output path: ${relativePath}`);
  }

  let parentDescriptor = owned.descriptor;
  let openedParent = -1;
  try {
    for (const segment of segments.slice(0, -1)) {
      let nextParent: number;
      try {
        nextParent = openRelativeDirectorySync(parentDescriptor, segment);
      } catch {
        makeRelativeDirectorySync(parentDescriptor, segment, 0o700);
        nextParent = openRelativeDirectorySync(parentDescriptor, segment);
      }
      if (openedParent >= 0) closeSync(openedParent);
      openedParent = nextParent;
      parentDescriptor = nextParent;
    }

    const descriptor = openRelativeDescriptorSync(
      parentDescriptor,
      segments.at(-1)!,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      fchmodSync(descriptor, 0o600);
      const info = fstatSync(descriptor);
      if (!info.isFile()) {
        throw new Error(`Retained output is not a file: ${relativePath}`);
      }
      return { descriptor, bytes: 0 };
    } catch (error) {
      closeSync(descriptor);
      throw error;
    }
  } finally {
    if (openedParent >= 0) closeSync(openedParent);
  }
};

export const releaseRetainedArchiveFile = (file: RetainedArchiveFile): void => {
  if (file.descriptor < 0) return;
  closeSync(file.descriptor);
  file.descriptor = -1;
};

export const releaseRetainedOutputFile = releaseRetainedArchiveFile;

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
  const destination = join(owned.parent.path, basename(requestedDestination));
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

    removeRelativeDirectoryRecursiveSync(owned.parent.descriptor, sealedName);
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
    /[*?]/.test(entryPath) ||
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

export const escapeZipEntrySelector = (entryPath: string): string =>
  entryPath.replaceAll("[", "[[]");

export const listZipEntries = async (
  source: string,
  runner: CommandRunner = runCommand,
  sourceDescriptor?: number,
): Promise<ArchiveEntry[]> => {
  const argv = ["unzip", "-Z1", source];
  const result = await runner(
    argv,
    sourceDescriptor === undefined
      ? undefined
      : {
          inheritedDescriptors: [sourceDescriptor],
          executionArgv: ["unzip", "-Z1", "/dev/fd/3"],
        },
  );
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

const spawnZipEntryHeader: ZipEntryHeaderSpawner = (argv, options) =>
  Bun.spawn(options?.executionArgv ?? argv, {
    stdio: [
      "ignore",
      "pipe",
      "ignore",
      ...(options?.inheritedDescriptors ?? []),
    ],
  }) as ZipEntryHeaderProcess;

export const readZipEntryHeader = async (
  source: string,
  entry: ArchiveEntry | string,
  spawn: ZipEntryHeaderSpawner = spawnZipEntryHeader,
  sourceDescriptor?: number,
): Promise<Uint8Array> => {
  const rawSelector =
    typeof entry === "string" ? entry : (entry.selector ?? entry.path);
  validateArchiveEntryPath(rawSelector);
  const selector = escapeZipEntrySelector(rawSelector);
  const argv = ["unzip", "-p", source, selector];
  const child = spawn(
    argv,
    sourceDescriptor === undefined
      ? undefined
      : {
          inheritedDescriptors: [sourceDescriptor],
          executionArgv: ["unzip", "-p", "/dev/fd/3", selector],
        },
  );
  const reader = child.stdout.getReader();

  try {
    const header = new Uint8Array(32);
    let length = 0;
    while (length < header.byteLength) {
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
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
        if (exitCode !== undefined && exitCode !== 0) {
          throw archiveCommandError("read ZIP entry header", exitCode);
        }
        throw error;
      }
      if (chunk.done) {
        const exitCode = await child.exited;
        if (exitCode !== 0) {
          throw archiveCommandError("read ZIP entry header", exitCode);
        }
        break;
      }
      const count = Math.min(
        chunk.value.byteLength,
        header.byteLength - length,
      );
      header.set(chunk.value.subarray(0, count), length);
      length += count;
    }
    return header.slice(0, length);
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

const readExactlyAt = (
  descriptor: number,
  length: number,
  position: number,
): Uint8Array => {
  const bytes = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    const count = readSync(
      descriptor,
      bytes,
      offset,
      length - offset,
      position + offset,
    );
    if (count === 0) throw new Error("Invalid ZIP central directory metadata");
    offset += count;
  }
  return bytes;
};

const validateZipEntryTypes = (
  source: string,
  retainedDescriptor?: number,
): void => {
  let descriptor = retainedDescriptor ?? -1;
  let ownedDescriptor = false;
  try {
    if (descriptor < 0) {
      try {
        descriptor = openSync(
          source,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        ownedDescriptor = true;
      } catch (error) {
        // Unit adapters may model an archive without a filesystem fixture.
        if (hasErrorCode(error, "ENOENT")) return;
        throw error;
      }
    }

    const size = fstatSync(descriptor).size;
    const tailLength = Math.min(size, 65_557);
    const tailOffset = size - tailLength;
    const tail = readExactlyAt(descriptor, tailLength, tailOffset);
    const tailView = new DataView(
      tail.buffer,
      tail.byteOffset,
      tail.byteLength,
    );
    let endOffset = -1;
    for (let offset = tail.byteLength - 22; offset >= 0; offset -= 1) {
      if (tailView.getUint32(offset, true) === 0x06054b50) {
        endOffset = offset;
        break;
      }
    }
    if (endOffset < 0)
      throw new Error("Invalid ZIP central directory metadata");

    const entryCount = tailView.getUint16(endOffset + 10, true);
    const centralOffset = tailView.getUint32(endOffset + 16, true);
    if (entryCount === 0xffff || centralOffset === 0xffffffff) {
      throw new Error("ZIP64 archives are not supported by the safe extractor");
    }

    let position = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
      const header = readExactlyAt(descriptor, 46, position);
      const view = new DataView(
        header.buffer,
        header.byteOffset,
        header.byteLength,
      );
      if (view.getUint32(0, true) !== 0x02014b50) {
        throw new Error("Invalid ZIP central directory metadata");
      }
      const creatorSystem = view.getUint16(4, true) >>> 8;
      const nameLength = view.getUint16(28, true);
      const extraLength = view.getUint16(30, true);
      const commentLength = view.getUint16(32, true);
      if (creatorSystem === 3) {
        const unixMode = view.getUint32(38, true) >>> 16;
        const fileType = unixMode & 0o170000;
        if (fileType === 0o120000) {
          throw new Error("ZIP archive contains a symbolic link");
        }
        if (fileType !== 0 && fileType !== 0o100000 && fileType !== 0o040000) {
          throw new Error("ZIP archive contains an unsafe special file");
        }
      }
      position += 46 + nameLength + extraLength + commentLength;
      if (position > size)
        throw new Error("Invalid ZIP central directory metadata");
    }
  } finally {
    if (ownedDescriptor && descriptor >= 0) closeSync(descriptor);
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
  sourceDescriptor?: number,
): Promise<ArchiveEntry[]> => {
  let effectiveSourceDescriptor = sourceDescriptor;
  let ownsSourceDescriptor = false;
  if (effectiveSourceDescriptor === undefined) {
    try {
      effectiveSourceDescriptor = openSync(
        source,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      ownsSourceDescriptor = true;
    } catch (error) {
      // Test adapters may model an archive without a filesystem fixture.
      if (!hasErrorCode(error, "ENOENT")) throw error;
    }
  }

  try {
    const entries = await listZipEntries(
      source,
      runner,
      effectiveSourceDescriptor,
    );
    validateZipEntryTypes(source, effectiveSourceDescriptor);
    const destinationPath = resolve(destination);
    await ensurePathIsAbsent(destinationPath);
    const staging = createOwnedTemporaryDirectory(
      join(dirname(destinationPath), `.${basename(destinationPath)}.extract-`),
      retainedParent,
    );

    try {
      if (effectiveSourceDescriptor === undefined) {
        const result = await runner([
          "unzip",
          "-qq",
          source,
          "-d",
          staging.path,
        ]);
        if (result.exitCode !== 0) {
          throw archiveCommandError(
            "extract ZIP archive",
            result.exitCode,
            result.stderr,
          );
        }
      } else {
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const output = retainOwnedOutputFile(staging, entry.path);
          try {
            const selector = entry.selector ?? entry.path;
            const argv = ["unzip", "-p", source, selector];
            const result = await runner(argv, {
              inheritedDescriptors: [effectiveSourceDescriptor],
              executionArgv: ["unzip", "-p", "/dev/fd/3", selector],
              stdoutDescriptor: output.descriptor,
            });
            if (result.exitCode !== 0) {
              throw archiveCommandError(
                `extract ZIP entry "${entry.path}"`,
                result.exitCode,
                result.stderr,
              );
            }
          } finally {
            releaseRetainedOutputFile(output);
          }
        }
      }

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
  } finally {
    if (ownsSourceDescriptor && effectiveSourceDescriptor !== undefined) {
      closeSync(effectiveSourceDescriptor);
    }
  }
};
