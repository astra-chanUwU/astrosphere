import { randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { getMediaLayout, requireMediaRoot } from "./config";
import { MediaError } from "./errors";
import { type CommandRunner, runCommand } from "./process";

export type RemoteMediaTarget = {
  login: string;
  root: string;
  value: string;
};

export type RemoteMediaFile = {
  path: string;
  bytes: number;
};

export type PruneManifest = {
  version: 1;
  operationId: string;
  generatedAt: string;
  target: string;
  files: RemoteMediaFile[];
  totalBytes: number;
};

export type CreateMediaSyncCommandOptions = {
  root: string;
  target: string;
  dryRun: boolean;
};

const targetMessage =
  "MEDIA_SYNC_TARGET must use user@host:/absolute/path format.";

export const parseRemoteMediaTarget = (value: string): RemoteMediaTarget => {
  const supplied = value.trim();
  const match = supplied.match(/^([^@\s/:]+@[^\s/:]+):(\/[A-Za-z0-9._/-]*)$/);
  if (!match) throw new MediaError("configuration", targetMessage);

  const login = match[1]!;
  const remoteRoot = match[2]!.replace(/\/+$/, "") || "/";
  if (remoteRoot.split("/").includes("..")) {
    throw new MediaError("configuration", targetMessage);
  }
  return {
    login,
    root: remoteRoot,
    value: `${login}:${remoteRoot}`,
  };
};

const withTrailingSlash = (value: string): string =>
  value === "/" ? value : `${value}/`;

export const createMediaSyncCommand = (
  options: CreateMediaSyncCommandOptions,
): string[] => {
  const root = requireMediaRoot(options.root);
  const target = parseRemoteMediaTarget(options.target);
  return [
    "rsync",
    "--archive",
    "--human-readable",
    "--progress",
    "--exclude",
    "/.astrosphere/",
    ...(options.dryRun ? ["--dry-run"] : []),
    withTrailingSlash(root),
    `${target.login}:${withTrailingSlash(target.root)}`,
  ];
};

export const createRemoteListCommand = (
  target: RemoteMediaTarget,
): string[] => [
  "rsync",
  "--recursive",
  "--list-only",
  "--out-format=%l|%n",
  `${target.login}:${withTrailingSlash(target.root)}`,
];

const assertSafeMediaPath = (path: string): void => {
  const parts = path.split("/");
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    /[\0\r\n\t]/.test(path) ||
    parts.some((part) => part === "" || part === "." || part === "..") ||
    !(path.startsWith("manga/") || path.startsWith("images/"))
  ) {
    throw new MediaError(
      "synchronization",
      `unsafe media path: ${JSON.stringify(path)}`,
    );
  }
};

export const parseRemoteFileList = (stdout: string): RemoteMediaFile[] => {
  const files: RemoteMediaFile[] = [];
  for (const line of stdout.split("\n")) {
    if (!line) continue;
    const separator = line.indexOf("|");
    if (separator < 1) {
      throw new MediaError(
        "synchronization",
        `Remote inventory has an invalid entry: ${JSON.stringify(line)}`,
      );
    }
    const byteText = line.slice(0, separator);
    const path = line.slice(separator + 1);
    if (!/^\d+$/.test(byteText) || !Number.isSafeInteger(Number(byteText))) {
      throw new MediaError(
        "synchronization",
        `Remote inventory has an invalid byte count: ${JSON.stringify(byteText)}`,
      );
    }
    if (path.endsWith("/") || path === ".") continue;
    if (path === ".astrosphere" || path.startsWith(".astrosphere/")) continue;
    assertSafeMediaPath(path);
    files.push({ path, bytes: Number(byteText) });
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
};

export const listLocalMediaFiles = async (
  rootValue: string,
): Promise<RemoteMediaFile[]> => {
  const layout = getMediaLayout(rootValue);
  const files: RemoteMediaFile[] = [];

  const walk = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const filePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(filePath);
        continue;
      }
      if (!entry.isFile()) continue;

      const publicPath = relative(layout.root, filePath).split(sep).join("/");
      assertSafeMediaPath(publicPath);
      const stats = await lstat(filePath);
      files.push({ path: publicPath, bytes: stats.size });
    }
  };

  await walk(layout.manga);
  await walk(layout.images);
  return files.sort((left, right) => left.path.localeCompare(right.path));
};

type CreatePruneManifestOptions = {
  target: RemoteMediaTarget;
  local: RemoteMediaFile[];
  remote: RemoteMediaFile[];
  operationId: string;
  generatedAt: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const inventoryMap = (
  files: RemoteMediaFile[],
  label: string,
): Map<string, number> => {
  const result = new Map<string, number>();
  for (const file of files) {
    assertSafeMediaPath(file.path);
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      throw new MediaError(
        "synchronization",
        `${label} inventory has an invalid byte count for ${file.path}`,
      );
    }
    if (result.has(file.path)) {
      throw new MediaError(
        "synchronization",
        `${label} inventory contains a duplicate path: ${file.path}`,
      );
    }
    result.set(file.path, file.bytes);
  }
  return result;
};

export const createPruneManifest = (
  options: CreatePruneManifestOptions,
): PruneManifest => {
  if (!uuidPattern.test(options.operationId)) {
    throw new MediaError("synchronization", "Invalid prune operation ID.");
  }
  if (
    !Number.isFinite(Date.parse(options.generatedAt)) ||
    new Date(options.generatedAt).toISOString() !== options.generatedAt
  ) {
    throw new MediaError("synchronization", "Invalid prune generation time.");
  }

  const local = inventoryMap(options.local, "Local");
  const remote = inventoryMap(options.remote, "Remote");
  const files = [...remote]
    .filter(([path]) => !local.has(path))
    .map(([path, bytes]) => ({ path, bytes }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
  if (!Number.isSafeInteger(totalBytes)) {
    throw new MediaError("synchronization", "Prune byte total is too large.");
  }

  return {
    version: 1,
    operationId: options.operationId,
    generatedAt: options.generatedAt,
    target: options.target.value,
    files,
    totalBytes,
  };
};

export const assertPruneSnapshotCurrent = (
  manifest: PruneManifest,
  localFiles: RemoteMediaFile[],
  remoteFiles: RemoteMediaFile[],
): void => {
  const local = inventoryMap(localFiles, "Local");
  const remote = inventoryMap(remoteFiles, "Remote");
  for (const file of manifest.files) {
    if (local.has(file.path)) {
      throw new MediaError(
        "synchronization",
        "local media changed after the prune manifest was created",
      );
    }
    if (remote.get(file.path) !== file.bytes) {
      throw new MediaError(
        "synchronization",
        "remote media changed after the prune manifest was created",
      );
    }
  }
};

export const formatPruneManifest = (manifest: PruneManifest): string => {
  const lines = ["Remote prune manifest:"];
  for (const file of manifest.files) {
    lines.push(`  ${file.path} (${file.bytes} bytes)`);
  }
  lines.push(`Files: ${manifest.files.length} | Bytes: ${manifest.totalBytes}`);
  return lines.join("\n");
};

export const writePruneManifest = async (
  manifest: PruneManifest,
  operationsRoot: string,
): Promise<string> => {
  await mkdir(operationsRoot, { recursive: true, mode: 0o700 });
  const timestamp = manifest.generatedAt.replace(/[.:]/g, "-");
  const destination = join(
    operationsRoot,
    `prune-${timestamp}-${manifest.operationId}.json`,
  );
  const temporary = join(
    operationsRoot,
    `.prune-${manifest.operationId}-${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return destination;
};

type Ask = (question: string) => Promise<string>;

const askOnTerminal: Ask = async (question) => {
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return await terminal.question(`${question} `);
  } finally {
    terminal.close();
  }
};

export const confirmPrune = async (
  question: string,
  ask: Ask = askOnTerminal,
): Promise<boolean> => (await ask(question)).trim() === "yes";

export const createRemotePruneScript = (): string => `set -eu
root=\$1
operation_id=\$2
case "\$root" in
  /*) ;;
  *) echo "remote media root must be absolute" >&2; exit 1 ;;
esac
case "\$root" in
  *[!A-Za-z0-9_./-]*) echo "remote media root contains unsafe characters" >&2; exit 1 ;;
esac
printf '%s\\n' "\$operation_id" | grep -Eq '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$' || {
  echo "invalid prune operation ID" >&2
  exit 1
}
operations="\$root/.astrosphere"
manifest="\$operations/prune-\$operation_id.tsv"
stage="\$operations/prune-\$operation_id"
moved="\$stage/.moved"
tab=\$(printf '\\t')
carriage=\$(printf '\\r')
[ -f "\$manifest" ] && [ ! -L "\$manifest" ] || {
  echo "missing regular prune manifest" >&2
  exit 1
}
[ ! -e "\$stage" ] && [ ! -L "\$stage" ] || {
  echo "prune staging path already exists" >&2
  exit 1
}

while IFS="\$tab" read -r expected path extra; do
  [ -n "\$expected" ] && [ -n "\$path" ] && [ -z "\${extra:-}" ] || {
    echo "malformed prune manifest entry" >&2
    exit 1
  }
  case "\$expected" in *[!0-9]*) echo "invalid prune size" >&2; exit 1 ;; esac
  case "\$path" in
    manga/*|images/*) ;;
    *) echo "unsafe prune path" >&2; exit 1 ;;
  esac
  case "\$path" in
    /*|*\\\\*|*"\$carriage"*|../*|*/../*|*/..|./*|*/./*|*/.|*//*|manga/|images/)
      echo "unsafe prune path" >&2
      exit 1
      ;;
  esac
  source="\$root/\$path"
  [ -f "\$source" ] && [ ! -L "\$source" ] || {
    echo "prune source is not a regular file" >&2
    exit 1
  }
  actual=\$(stat -c %s -- "\$source" 2>/dev/null || stat -f %z -- "\$source")
  [ "\$actual" = "\$expected" ] || {
    echo "prune source size changed" >&2
    exit 1
  }
done < "\$manifest"

umask 077
mkdir -p -- "\$stage"
: > "\$moved"
rollback() {
  status=\$?
  trap - EXIT HUP INT TERM
  if [ -f "\$moved" ]; then
    awk '{ lines[NR] = \$0 } END { for (i = NR; i > 0; i--) print lines[i] }' "\$moved" |
    while IFS= read -r path; do
      [ -n "\$path" ] || continue
      staged="\$stage/\$path"
      destination="\$root/\$path"
      if [ -f "\$staged" ] && [ ! -L "\$staged" ]; then
        mkdir -p -- "\${destination%/*}"
        mv -- "\$staged" "\$destination" || true
      fi
    done
  fi
  rm -rf -- "\$stage"
  exit "\$status"
}
trap rollback EXIT HUP INT TERM

while IFS="\$tab" read -r expected path extra; do
  source="\$root/\$path"
  destination="\$stage/\$path"
  mkdir -p -- "\${destination%/*}"
  printf '%s\\n' "\$path" >> "\$moved"
  mv -- "\$source" "\$destination"
done < "\$manifest"

trap - EXIT HUP INT TERM
rm -rf -- "\$stage"
rm -f -- "\$manifest"
[ ! -d "\$root/manga" ] || find "\$root/manga" -depth -type d -empty -delete
[ ! -d "\$root/images" ] || find "\$root/images" -depth -type d -empty -delete
`;

const commandFailure = (argv: string[], stderr: string): MediaError => {
  const detail = stderr.trim();
  return new MediaError(
    "synchronization",
    `${argv[0]} failed${detail ? `: ${detail}` : ""}`,
  );
};

const runChecked = async (
  runner: CommandRunner,
  argv: string[],
  stdin?: string,
) => {
  const result = await runner(
    argv,
    stdin === undefined ? undefined : { stdin },
  );
  if (result.exitCode !== 0) throw commandFailure(argv, result.stderr);
  return result;
};

export type ExecutePruneManifestOptions = {
  manifest: PruneManifest;
  target: RemoteMediaTarget;
  runner?: CommandRunner;
};

export const executePruneManifest = async (
  options: ExecutePruneManifestOptions,
): Promise<void> => {
  const runner = options.runner ?? runCommand;
  if (options.manifest.target !== options.target.value) {
    throw new MediaError(
      "synchronization",
      "Prune manifest target does not match the synchronization target.",
    );
  }
  inventoryMap(options.manifest.files, "Prune manifest");

  const temporaryRoot = await mkdtemp(join(tmpdir(), "astrosphere-prune-"));
  const tsvPath = join(
    temporaryRoot,
    `prune-${options.manifest.operationId}.tsv`,
  );
  const remoteTsv = `${options.target.login}:${withTrailingSlash(options.target.root)}.astrosphere/prune-${options.manifest.operationId}.tsv`;
  const prepareScript = `set -eu
root=\$1
case "\$root" in /*) ;; *) exit 1 ;; esac
case "\$root" in *[!A-Za-z0-9_./-]*) exit 1 ;; esac
umask 077
mkdir -p -- "\$root/.astrosphere"
`;
  try {
    const tsv = options.manifest.files
      .map(({ bytes, path }) => `${bytes}\t${path}\n`)
      .join("");
    await writeFile(tsvPath, tsv, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await runChecked(
      runner,
      ["ssh", options.target.login, "sh", "-s", "--", options.target.root],
      prepareScript,
    );
    await runChecked(runner, ["rsync", "--archive", tsvPath, remoteTsv]);
    await runChecked(
      runner,
      [
        "ssh",
        options.target.login,
        "sh",
        "-s",
        "--",
        options.target.root,
        options.manifest.operationId,
      ],
      createRemotePruneScript(),
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};

export type SyncMediaOptions = {
  root: string;
  target: string;
  dryRun: boolean;
  prune: boolean;
  runner?: CommandRunner;
  confirm?: typeof confirmPrune;
  onManifest?: (manifest: PruneManifest) => void;
};

export type SyncMediaResult = {
  manifest?: PruneManifest;
  pruned: boolean;
};

const listRemoteMediaFiles = async (
  target: RemoteMediaTarget,
  runner: CommandRunner,
): Promise<RemoteMediaFile[]> => {
  const command = createRemoteListCommand(target);
  const result = await runChecked(runner, command);
  return parseRemoteFileList(new TextDecoder().decode(result.stdout));
};

export const syncMedia = async (
  options: SyncMediaOptions,
): Promise<SyncMediaResult> => {
  const root = requireMediaRoot(options.root);
  const target = parseRemoteMediaTarget(options.target);
  const runner = options.runner ?? runCommand;
  await runChecked(
    runner,
    createMediaSyncCommand({
      root,
      target: target.value,
      dryRun: options.dryRun,
    }),
  );
  if (!options.prune) return { pruned: false };

  const [local, remote] = await Promise.all([
    listLocalMediaFiles(root),
    listRemoteMediaFiles(target, runner),
  ]);
  const manifest = createPruneManifest({
    target,
    local,
    remote,
    operationId: randomUUID(),
    generatedAt: new Date().toISOString(),
  });
  options.onManifest?.(manifest);
  if (options.dryRun) return { manifest, pruned: false };

  await writePruneManifest(manifest, getMediaLayout(root).operations);
  if (manifest.files.length === 0) return { manifest, pruned: false };

  const confirmed = await (options.confirm ?? confirmPrune)(
    "Type yes to delete these remote files:",
  );
  if (!confirmed) return { manifest, pruned: false };

  const [currentLocal, currentRemote] = await Promise.all([
    listLocalMediaFiles(root),
    listRemoteMediaFiles(target, runner),
  ]);
  assertPruneSnapshotCurrent(manifest, currentLocal, currentRemote);
  await executePruneManifest({ manifest, target, runner });
  return { manifest, pruned: true };
};
