import { resolve } from "node:path";
import { MediaError } from "./errors";
import type { OptimizeOptions, OptimizerProfile } from "./optimizer";

export type MediaCommand = "serve" | "optimize" | "validate" | "sync" | "add" | "remove";

export const mediaHelp = `Usage:
  bun run media:serve
  bun run media:add manga-volume <source...> --series <slug> [--quality <1..100>] [--draft]
  bun run media:remove manga <series> --chapter <number> --unavailable
  bun run media:optimize <source> --output <destination> --profile <reader|gallery> [options]
  bun run media:validate
  bun run media:sync [--dry-run] [--prune]`;

export const optimizeHelp = `Usage:
  bun run media:optimize <source> --output <destination> --profile <reader|gallery> [options]

Options:
  --quality <1..100>  WebP quality (default: 85)
  --dry-run           Show the plan without writing output
  -h, --help          Show this help`;

export const addHelp = `Usage:
  bun run media:add manga-volume <source...> --series <slug> [--quality <1..100>] [--draft]
  bun run media:add batch <source-folder> --manifest <file> [--quality <1..100>] [--dry-run] [--draft]

Manga-volume sources may be CBZ/ZIP files or folders of archives. Batch imports use a reviewed YAML manifest. Imports are published by default.`;

export const removeHelp = `Usage:
  bun run media:remove manga <series> --chapter <number> --unavailable

Removes a chapter's heavy media after confirmation while preserving its published entry as currently unavailable.`;

const commands: MediaCommand[] = ["serve", "optimize", "validate", "sync", "add", "remove"];

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

export const parseOptimizeArgs = (argv: string[]): OptimizeOptions => {
  let source: string | undefined;
  let destination: string | undefined;
  let profile: OptimizerProfile | undefined;
  let quality = 85;
  let dryRun = false;
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
      default:
        throw new MediaError("usage", `Unknown optimize option: ${argument}`);
    }
  }

  if (!source) throw new MediaError("usage", "source is required");
  if (!destination) throw new MediaError("usage", "--output is required");
  if (!profile) throw new MediaError("usage", "--profile is required");

  return { source, destination, profile, quality, dryRun };
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

const parseAddBatchArgs = (args: string[]): AddBatchArgs => {
  const sources: string[] = [];
  let manifest: string | undefined;
  let quality = 85;
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
  let quality = 85;
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
