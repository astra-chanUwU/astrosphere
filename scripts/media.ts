import { mediaHelp, parseMediaCommand } from "../src/lib/media/cli";
import { requireMediaPort, requireMediaRoot } from "../src/lib/media/config";
import { exitCodeForMediaError, MediaError } from "../src/lib/media/errors";
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

const run = (): void => {
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

  throw new MediaError("usage", `The media:${command} command is not available until its implementation plan is complete.`);
};

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Media command failed: ${message}`);
  process.exitCode = exitCodeForMediaError(error);
}
