import { lstat, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
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

export const publishStagedZipDirectory: ArchivePublisher = async (
  stagingPath,
  destinationPath,
) => {
  try {
    if (process.platform === "darwin") {
      const library = dlopen("/usr/lib/libSystem.B.dylib", {
        renamex_np: { args: ["cstring", "cstring", "u32"], returns: "i32" },
      });
      try {
        if (
          library.symbols.renamex_np(
            posixPath(stagingPath),
            posixPath(destinationPath),
            0x00000004,
          ) !== 0
        ) {
          throw noReplacePublishError(destinationPath);
        }
        return;
      } finally {
        library.close();
      }
    }

    if (process.platform === "linux") {
      const library = dlopen("libc.so.6", {
        renameat2: {
          args: ["i32", "cstring", "i32", "cstring", "u32"],
          returns: "i32",
        },
      });
      try {
        if (
          library.symbols.renameat2(
            -100,
            posixPath(stagingPath),
            -100,
            posixPath(destinationPath),
            1,
          ) !== 0
        ) {
          throw noReplacePublishError(destinationPath);
        }
        return;
      } finally {
        library.close();
      }
    }

    if (process.platform === "win32") {
      const library = dlopen("kernel32.dll", {
        MoveFileW: { args: ["ptr", "ptr"], returns: "bool" },
      });
      try {
        if (
          !library.symbols.MoveFileW(
            windowsPath(stagingPath),
            windowsPath(destinationPath),
          )
        ) {
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
      `Atomic no-replace ZIP publication is unavailable on ${process.platform}.`,
    );
  }

  throw new Error(
    `Atomic no-replace ZIP publication is unavailable on ${process.platform}.`,
  );
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
): Promise<ArchiveEntry[]> => {
  const entries = await listZipEntries(source, runner);
  const destinationPath = resolve(destination);
  await ensurePathIsAbsent(destinationPath);
  const stagingPath = await mkdtemp(
    join(dirname(destinationPath), `.${basename(destinationPath)}.extract-`),
  );

  try {
    const result = await runner(["unzip", "-qq", source, "-d", stagingPath]);
    if (result.exitCode !== 0)
      throw archiveCommandError(
        "extract ZIP archive",
        result.exitCode,
        result.stderr,
      );

    await verifyExtractedTree(stagingPath);
    await publish(stagingPath, destinationPath);
    return entries;
  } catch (error) {
    try {
      await rm(stagingPath, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "ZIP extraction failed and its staging directory could not be removed",
      );
    }
    throw error;
  }
};
