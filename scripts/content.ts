import {
  createContentTemplate,
  type ContentTemplateType,
} from "../src/lib/content/templates";
import { extractTerminalOptions } from "../src/lib/terminal/format";
import { TerminalSession } from "../src/lib/terminal/session";

const help = "Usage: bun run content:new <essay|doujinshi|image-set> <slug> [--plain]";
const types: ContentTemplateType[] = ["essay", "doujinshi", "image-set"];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
let session: TerminalSession | undefined;

const interrupt = (): never => {
  session?.dispose();
  process.stderr.write("\n! Content command interrupted.\n");
  process.exit(130);
};

process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);

const run = async (): Promise<void> => {
  const terminal = extractTerminalOptions(Bun.argv.slice(2));
  const [command, suppliedType, slug, ...extra] = terminal.args;
  session = new TerminalSession({
    scope: "content",
    command: command ?? "command",
    plain: terminal.plain,
    errorOutput: (text) => process.stderr.write(text),
  });
  if (command === "--help" || command === "-h") {
    console.log(help);
    return;
  }
  if (command !== "new" || extra.length > 0 || !suppliedType || !slug) {
    throw new Error(help);
  }
  if (!types.includes(suppliedType as ContentTemplateType)) {
    throw new Error("type must be essay, doujinshi, or image-set");
  }
  if (!slugPattern.test(slug)) {
    throw new Error("slug must use lowercase letters, numbers, and hyphens only");
  }
  session.start({ title: `Creating ${suppliedType} draft · ${slug}` });
  const result = await createContentTemplate({
    type: suppliedType as ContentTemplateType,
    slug,
    projectRoot: process.cwd(),
    date: new Date(),
  });
  session.complete("Draft created", [["Path", result.path], ["Next", result.next]]);
};

try {
  await run();
} catch (error) {
  const message = `Content command failed: ${error instanceof Error ? error.message : String(error)}`;
  if (session) session.fail(message);
  else console.error(message);
  process.exitCode = 2;
}
