import { resolve } from "node:path";
import { MediaError } from "./errors";
import type { OptimizeOptions, OptimizerProfile } from "./optimizer";

export type MediaCommand = "serve" | "optimize" | "validate" | "sync";

export const mediaHelp = `Usage:
  bun run media:serve
  bun run media:optimize <source> --output <destination> --profile <reader|gallery> [options]
  bun run media:validate
  bun run media:sync ...`;

export const optimizeHelp = `Usage:
  bun run media:optimize <source> --output <destination> --profile <reader|gallery> [options]

Options:
  --quality <1..100>  WebP quality (default: 85)
  --dry-run           Show the plan without writing output
  -h, --help          Show this help`;

const commands: MediaCommand[] = ["serve", "optimize", "validate", "sync"];

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
