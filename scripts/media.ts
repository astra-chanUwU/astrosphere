import { mediaHelp, parseMediaCommand, parseOptimizeArgs } from "../src/lib/media/cli";
import { requireMediaPort, requireMediaRoot } from "../src/lib/media/config";
import { exitCodeForMediaError, MediaError } from "../src/lib/media/errors";
import { optimizeMedia } from "../src/lib/media/optimizer";
import { createBunMediaFetch } from "../src/lib/media/server";

const serve = (args: string[]): void => {
  if (args.length > 0) throw new MediaError("usage", "The serve command does not accept arguments.");

  const root = requireMediaRoot();
  const port = requireMediaPort();
  const server = Bun.serve({
    fetch: createBunMediaFetch(root),
    hostname: "127.0.0.1",
    port,
  });

  console.log(`Serving external media from ${root} at http://127.0.0.1:${server.port}`);
  console.log("Public routes: /manga/* and /media/images/*");
};

const optimize = async (args: string[]): Promise<void> => {
  const options = parseOptimizeArgs(args);
  const result = await optimizeMedia(options);
  if (options.dryRun) {
    console.log("Media optimization dry run:");
    for (const item of result.plan.items) {
      console.log(`  ${item.sourceRelativePath} -> ${item.outputRelativePath}`);
    }
    return;
  }

  console.log("Media optimization complete:");
  console.log(`  Converted: ${result.converted}`);
  console.log(`  Copied: ${result.copied}`);
  console.log(`  Ignored: ${result.ignored}`);
  console.log(`  Failed: ${result.failed}`);
  console.log(`  Original bytes: ${result.originalBytes}`);
  console.log(`  Optimized bytes: ${result.optimizedBytes}`);
  console.log(`  Saved bytes: ${result.savedBytes}`);
};

const run = async (): Promise<void> => {
  const argv = Bun.argv.slice(2);
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    console.log(mediaHelp);
    return;
  }

  const { command, args } = parseMediaCommand(argv);
  if (command === "serve") {
    serve(args);
    return;
  }

  if (command === "optimize") {
    await optimize(args);
    return;
  }

  throw new MediaError("usage", `The media:${command} command is not available until its implementation plan is complete.`);
};

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Media command failed: ${message}`);
  process.exitCode = exitCodeForMediaError(error);
}
