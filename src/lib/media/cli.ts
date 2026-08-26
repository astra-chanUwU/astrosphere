import { resolve } from "node:path";
import { MediaError } from "./errors";
import type { OptimizerProfile } from "./optimizer";
import type { MaintainArgs } from "./maintenance-types";

export type MediaCommand =
  | "serve"
  | "optimize"
  | "thumbnails"
  | "validate"
  | "sync"
  | "add"
  | "remove";

export const mediaHelp = `Usage:
  bun run media:serve
  bun run media:add manga-volume <source...> --series <slug> [--quality <1..100>] [--draft]
  bun run media:remove manga <series> --chapter <number> --unavailable
  bun run media:optimize <source> (--output <destination> | --in-place) --profile <reader|gallery> [options]
  bun run media:thumbnails [--series <slug>] [--dry-run] [--force]
  bun run media:validate
  bun run media:sync [--dry-run] [--prune]`;

export const maintenanceHelp = `Usage:
  bun run media:maintain plan [--quality <1..100>]
  bun run media:maintain apply <operation-id> [--jobs <1..32>]

Options:
  --quality <1..100>  WebP quality (default: 85; plan only)
  --jobs <1..32>     Maximum parallel jobs (default: up to 4)
  -h, --help         Show this help`;

export const optimizeHelp = `Usage:
  bun run media:optimize <source> (--output <destination> | --in-place) --profile <reader|gallery> [options]
  bun run media:optimize video <source-root> --manifest <file> [--dry-run]

Options:
  --quality <1..100>  WebP quality (default: 85)
  --web-reader         Resize stills to 2400px portrait / 4000px landscape (default quality: 90)
  --in-place           Replace verified managed WebP files after confirmation
  --dry-run           Show the plan without writing output
  -h, --help          Show this help`;

export const thumbnailHelp = `Usage:
  bun run media:thumbnails [--series <slug>] [--dry-run] [--force]

Options:
  --series <slug>  Restrict generation to one manga or doujinshi series
                   Without this option, generates all managed preview thumbnails
  --dry-run        Show planned generation without writing files
  --force          Regenerate valid fresh thumbnails
  -h, --help       Show this help`;

export const addHelp = `Usage:
  bun run media:add manga-volume <source...> --series <slug> [--quality <1..100>] [--draft]
  bun run media:add batch <source-folder> --manifest <file> [--quality <1..100>] [--dry-run] [--draft]

Manga-volume sources may be CBZ/ZIP files or folders of archives. Batch imports use a reviewed YAML manifest. Imports are published by default.`;

export const removeHelp = `Usage:
  bun run media:remove manga <series> --chapter <number> --unavailable

Removes a chapter's heavy media after confirmation while preserving its published entry as currently unavailable.`;

const commands: MediaCommand[] = [
  "serve",
  "optimize",
  "thumbnails",
  "validate",
  "sync",
  "add",
  "remove",
];

export const parseMediaCommand = (
  argv: string[],
): { command: MediaCommand; args: string[] } => {
  const [supplied, ...args] = argv;
  if (!supplied || !commands.includes(supplied as MediaCommand)) {
    throw new MediaError(
      "usage",
      supplied ? `Unknown media command: ${supplied}` : mediaHelp,
    );
  }
  return { command: supplied as MediaCommand, args };
};

const optimizeProfiles: OptimizerProfile[] = ["reader", "gallery"];

export type {
  MaintainArgs,
  MaintenanceEnvelope,
  MaintenanceErrorBody,
  MaintenanceErrorEnvelope,
} from "./maintenance-types";

export const maintenanceOperationIdPattern =
  /^[a-z0-9][a-z0-9-]{0,79}$/;

export const defaultMaintenanceJobs = (processors: number): number =>
  Math.max(1, Math.min(4, Math.floor(processors)));

const requireMaintainValue = (
  argv: string[],
  index: number,
  option: string,
): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new MediaError("usage", `${option} requires a value`);
  }
  return value;
};

const parseMaintenanceInteger = (
  value: string,
  option: "--quality" | "--jobs",
  minimum: number,
  maximum: number,
): number => {
  if (!/^\d+$/.test(value)) {
    throw new MediaError(
      "usage",
      `${option} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new MediaError(
      "usage",
      `${option} must be an integer from ${minimum} to ${maximum}`,
    );
  }
  return parsed;
};

const validateMaintenanceOperationId = (operationId: string): void => {
  if (!maintenanceOperationIdPattern.test(operationId)) {
    throw new MediaError(
      "usage",
      "operation ID must contain only lowercase letters, numbers, and hyphens (1 to 80 characters)",
    );
  }
};

export const parseMaintainArgs = (
  argv: string[],
  availableProcessors: number,
): MaintainArgs => {
  if (
    typeof availableProcessors !== "number" ||
    !Number.isFinite(availableProcessors)
  ) {
    throw new MediaError("usage", "available processor count is required");
  }
  const [action, ...args] = argv;
  if (!action) throw new MediaError("usage", maintenanceHelp);

  if (action === "plan") {
    let quality = 85;
    const seen = new Set<string>();
    for (let index = 0; index < args.length; index += 1) {
      const argument = args[index]!;
      if (argument !== "--quality") {
        throw new MediaError("usage", `Unknown plan option: ${argument}`);
      }
      if (seen.has(argument)) {
        throw new MediaError("usage", `${argument} may only be specified once`);
      }
      seen.add(argument);
      quality = parseMaintenanceInteger(
        requireMaintainValue(args, index, argument),
        "--quality",
        1,
        100,
      );
      index += 1;
    }
    return { action, quality };
  }

  if (action !== "apply") {
    throw new MediaError("usage", `Unknown maintain action: ${action}`);
  }

  let operationId: string | undefined;
  let jobs = defaultMaintenanceJobs(availableProcessors);
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (!argument.startsWith("--")) {
      if (operationId) {
        throw new MediaError("usage", "Only one operation ID is allowed");
      }
      validateMaintenanceOperationId(argument);
      operationId = argument;
      continue;
    }
    if (argument !== "--jobs") {
      throw new MediaError("usage", `Unknown apply option: ${argument}`);
    }
    if (seen.has(argument)) {
      throw new MediaError("usage", `${argument} may only be specified once`);
    }
    seen.add(argument);
    jobs = parseMaintenanceInteger(
      requireMaintainValue(args, index, argument),
      "--jobs",
      1,
      32,
    );
    index += 1;
  }

  if (!operationId) {
    throw new MediaError("usage", "operation ID is required");
  }
  return { action, operationId, jobs };
};

const requireOptimizeValue = (
  argv: string[],
  index: number,
  option: string,
): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new MediaError("usage", `${option} requires a value`);
  }
  return value;
};

const requireUniqueOptimizeOption = (
  seen: Set<string>,
  option: string,
): void => {
  if (seen.has(option)) {
    throw new MediaError("usage", `${option} may only be specified once`);
  }
  seen.add(option);
};

export type OptimizeCommandOptions = {
  kind?: undefined;
  source: string;
  destination?: string;
  profile: OptimizerProfile;
  quality: number;
  dryRun: boolean;
  webReader?: true;
  inPlace?: true;
};

export type VideoOptimizeCommandOptions = {
  kind: "video";
  sourceRoot: string;
  manifest: string;
  dryRun: boolean;
  source?: never;
  destination?: never;
  profile?: never;
  quality?: never;
  webReader?: never;
  inPlace?: never;
};

const parseVideoOptimizeArgs = (argv: string[]): VideoOptimizeCommandOptions => {
  const sources: string[] = [];
  let manifest: string | undefined;
  let dryRun = false;
  const seen = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) {
      sources.push(argument);
      continue;
    }
    if (seen.has(argument)) {
      throw new MediaError("usage", `${argument} may only be specified once`);
    }
    seen.add(argument);
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--manifest") {
      manifest = resolve(requireOptimizeValue(argv, index, argument));
      index += 1;
      continue;
    }
    throw new MediaError("usage", `Unknown video optimize option: ${argument}`);
  }
  if (sources.length !== 1) {
    throw new MediaError("usage", "Video optimization requires exactly one source root");
  }
  if (!manifest) throw new MediaError("usage", "--manifest is required");
  return {
    kind: "video",
    sourceRoot: resolve(sources[0]!),
    manifest,
    dryRun,
  };
};

export const parseOptimizeArgs = (argv: string[]): OptimizeCommandOptions | VideoOptimizeCommandOptions => {
  if (argv[0] === "video") return parseVideoOptimizeArgs(argv.slice(1));
  let source: string | undefined;
  let destination: string | undefined;
  let profile: OptimizerProfile | undefined;
  let quality: number | undefined;
  let dryRun = false;
  let webReader = false;
  let inPlace = false;
  let positionalOnly = false;
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!positionalOnly && argument === "--") {
      positionalOnly = true;
      continue;
    }
    if (positionalOnly || !argument.startsWith("--")) {
      if (!argument) {
        throw new MediaError("usage", "source is required");
      }
      if (source) {
        throw new MediaError(
          "usage",
          `Unexpected optimize argument: ${argument}`,
        );
      }
      source = resolve(argument);
      continue;
    }

    switch (argument) {
      case "--output": {
        requireUniqueOptimizeOption(seen, argument);
        destination = resolve(requireOptimizeValue(argv, index, argument));
        index += 1;
        break;
      }
      case "--profile": {
        requireUniqueOptimizeOption(seen, argument);
        const suppliedProfile = requireOptimizeValue(argv, index, argument);
        if (!optimizeProfiles.includes(suppliedProfile as OptimizerProfile)) {
          throw new MediaError("usage", "--profile must be reader or gallery");
        }
        profile = suppliedProfile as OptimizerProfile;
        index += 1;
        break;
      }
      case "--quality": {
        requireUniqueOptimizeOption(seen, argument);
        const suppliedQuality = requireOptimizeValue(argv, index, argument);
        if (!/^\d+$/.test(suppliedQuality)) {
          throw new MediaError(
            "usage",
            "--quality must be an integer from 1 to 100",
          );
        }
        const parsedQuality = Number(suppliedQuality);
        if (
          !Number.isSafeInteger(parsedQuality) ||
          parsedQuality < 1 ||
          parsedQuality > 100
        ) {
          throw new MediaError(
            "usage",
            "--quality must be an integer from 1 to 100",
          );
        }
        quality = parsedQuality;
        index += 1;
        break;
      }
      case "--dry-run":
        requireUniqueOptimizeOption(seen, argument);
        dryRun = true;
        break;
      case "--web-reader":
        requireUniqueOptimizeOption(seen, argument);
        webReader = true;
        break;
      case "--in-place":
        requireUniqueOptimizeOption(seen, argument);
        inPlace = true;
        break;
      default:
        throw new MediaError("usage", `Unknown optimize option: ${argument}`);
    }
  }

  if (!source) throw new MediaError("usage", "source is required");
  if (!profile) throw new MediaError("usage", "--profile is required");
  if (inPlace && destination) {
    throw new MediaError("usage", "--output cannot be combined with --in-place");
  }
  if (inPlace && !webReader) {
    throw new MediaError("usage", "--in-place requires --web-reader");
  }
  if (!destination && !inPlace) {
    throw new MediaError("usage", "--output is required unless --in-place is used");
  }

  return {
    source,
    destination,
    profile,
    quality: quality ?? (webReader ? 90 : 85),
    dryRun,
    ...(webReader ? { webReader: true as const } : {}),
    ...(inPlace ? { inPlace: true as const } : {}),
  };
};

export const parseValidateArgs = (argv: string[]): Record<string, never> => {
  if (argv.length > 0) {
    throw new MediaError(
      "usage",
      "The validate command does not accept arguments.",
    );
  }
  return {};
};

export type AddMangaVolumeArgs = {
  kind: "manga-volume";
  sources: string[];
  series: string;
  quality: number;
  status: "draft" | "published";
};

export type AddBatchArgs = {
  kind: "batch";
  source: string;
  manifest: string;
  quality: number;
  dryRun: boolean;
  status: "draft" | "published";
};

export type AddArgs = AddMangaVolumeArgs | AddBatchArgs;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ThumbnailArgs = {
  series?: string;
  dryRun: boolean;
  force: boolean;
};

export const parseThumbnailArgs = (argv: string[]): ThumbnailArgs => {
  let series: string | undefined;
  let dryRun = false;
  let force = false;
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (!argument.startsWith("--")) {
      throw new MediaError("usage", `Unexpected thumbnails argument: ${argument}`);
    }
    if (seen.has(argument)) {
      throw new MediaError("usage", `${argument} may only be specified once`);
    }
    seen.add(argument);
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--force") {
      force = true;
      continue;
    }
    if (argument === "--series") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new MediaError("usage", "--series requires a value");
      }
      if (!slugPattern.test(value)) {
        throw new MediaError(
          "usage",
          "--series must use lowercase letters, numbers, and hyphens only",
        );
      }
      series = value;
      index += 1;
      continue;
    }
    throw new MediaError("usage", `Unknown thumbnails option: ${argument}`);
  }

  return { series, dryRun, force };
};

const parseAddBatchArgs = (args: string[]): AddBatchArgs => {
  const sources: string[] = [];
  let manifest: string | undefined;
  let quality = 90;
  let dryRun = false;
  let status: "draft" | "published" = "published";
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (!argument.startsWith("--")) {
      sources.push(resolve(argument));
      continue;
    }
    if (seen.has(argument)) {
      throw new MediaError("usage", `${argument} may only be specified once`);
    }
    seen.add(argument);
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--draft") {
      status = "draft";
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new MediaError("usage", `${argument} requires a value`);
    }
    if (argument === "--manifest") {
      manifest = resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--quality") {
      if (!/^\d+$/.test(value)) {
        throw new MediaError("usage", "--quality must be an integer from 1 to 100");
      }
      quality = Number(value);
      if (quality < 1 || quality > 100) {
        throw new MediaError("usage", "--quality must be an integer from 1 to 100");
      }
      index += 1;
      continue;
    }
    throw new MediaError("usage", `Unknown add option: ${argument}`);
  }

  if (sources.length !== 1) {
    throw new MediaError("usage", "batch import requires exactly one source folder");
  }
  if (!manifest) throw new MediaError("usage", "--manifest is required");
  return {
    kind: "batch",
    source: sources[0]!,
    manifest,
    quality,
    dryRun,
    status,
  };
};

export const parseAddArgs = (argv: string[]): AddArgs => {
  const [kind, ...args] = argv;
  if (!kind) throw new MediaError("usage", addHelp);
  if (kind === "batch") return parseAddBatchArgs(args);
  if (kind !== "manga-volume") {
    throw new MediaError("usage", `Unknown add type: ${kind}`);
  }

  const sources: string[] = [];
  let series: string | undefined;
  let quality = 90;
  let status: "draft" | "published" = "published";
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (!argument.startsWith("--")) {
      sources.push(resolve(argument));
      continue;
    }

    if (seen.has(argument)) {
      throw new MediaError("usage", `${argument} may only be specified once`);
    }
    seen.add(argument);

    if (argument === "--draft") {
      status = "draft";
      continue;
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new MediaError("usage", `${argument} requires a value`);
    }

    if (argument === "--series") {
      if (!slugPattern.test(value)) {
        throw new MediaError(
          "usage",
          "--series must use lowercase letters, numbers, and hyphens only",
        );
      }
      series = value;
      index += 1;
      continue;
    }
    if (argument === "--quality") {
      if (!/^\d+$/.test(value)) {
        throw new MediaError("usage", "--quality must be an integer from 1 to 100");
      }
      quality = Number(value);
      if (quality < 1 || quality > 100) {
        throw new MediaError("usage", "--quality must be an integer from 1 to 100");
      }
      index += 1;
      continue;
    }
    throw new MediaError("usage", `Unknown add option: ${argument}`);
  }

  if (sources.length === 0) throw new MediaError("usage", "source is required");
  if (!series) throw new MediaError("usage", "--series is required");
  return { kind, sources, series, quality, status };
};

export type RemoveMangaChapterArgs = {
  kind: "manga";
  series: string;
  chapter: number;
};

export const parseRemoveArgs = (argv: string[]): RemoveMangaChapterArgs => {
  const [kind, series, ...args] = argv;
  if (!kind) throw new MediaError("usage", removeHelp);
  if (kind !== "manga") {
    throw new MediaError("usage", `Unknown remove type: ${kind}`);
  }
  if (!series || !slugPattern.test(series)) {
    throw new MediaError(
      "usage",
      "series must use lowercase letters, numbers, and hyphens only",
    );
  }

  let chapter: number | undefined;
  let unavailable = false;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (seen.has(argument)) {
      throw new MediaError("usage", `${argument} may only be specified once`);
    }
    seen.add(argument);
    if (argument === "--unavailable") {
      unavailable = true;
      continue;
    }
    if (argument === "--chapter") {
      const value = args[index + 1];
      if (!value || !/^\d+(?:\.\d+)?$/.test(value) || Number(value) <= 0) {
        throw new MediaError("usage", "--chapter must be a positive number");
      }
      chapter = Number(value);
      index += 1;
      continue;
    }
    throw new MediaError("usage", `Unknown remove option: ${argument}`);
  }

  if (chapter === undefined) {
    throw new MediaError("usage", "--chapter is required");
  }
  if (!unavailable) {
    throw new MediaError("usage", "--unavailable is required");
  }
  return { kind, series, chapter };
};

export type SyncArgs = { dryRun: boolean; prune: boolean };

export const parseSyncArgs = (argv: string[]): SyncArgs => {
  let dryRun = false;
  let prune = false;
  for (const argument of argv) {
    if (argument === "--dry-run") {
      if (dryRun)
        throw new MediaError("usage", "--dry-run may only be specified once");
      dryRun = true;
      continue;
    }
    if (argument === "--prune") {
      if (prune)
        throw new MediaError("usage", "--prune may only be specified once");
      prune = true;
      continue;
    }
    if (argument.startsWith("--")) {
      throw new MediaError("usage", `Unknown sync option: ${argument}`);
    }
    throw new MediaError("usage", `Unexpected sync argument: ${argument}`);
  }
  return { dryRun, prune };
};
