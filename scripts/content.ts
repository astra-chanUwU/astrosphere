import {
  createContentTemplate,
  type ContentTemplateType,
} from "../src/lib/content/templates";

const help = "Usage: bun run content:new <essay|doujinshi|image-set> <slug>";
const types: ContentTemplateType[] = ["essay", "doujinshi", "image-set"];
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const run = async (): Promise<void> => {
  const [command, suppliedType, slug, ...extra] = Bun.argv.slice(2);
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
  const result = await createContentTemplate({
    type: suppliedType as ContentTemplateType,
    slug,
    projectRoot: process.cwd(),
    date: new Date(),
  });
  console.log(`Created draft: ${result.path}`);
  console.log(result.next);
};

try {
  await run();
} catch (error) {
  console.error(`Content command failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
