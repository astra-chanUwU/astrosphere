import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createSanitizedPageName, isSupportedMangaImage, sortMangaSourceFiles } from "../src/lib/manga-sanitizer";

const chapterPattern = /^chapter-\d+(?:-\d+)?$/;
const usage = "Usage: bun run manga:sanitize <chapter-directory | series-directory> [--all] [--dry-run] [--quality 1-100]";

type Options = {
  inputPath: string;
  all: boolean;
  dryRun: boolean;
  quality: number;
};

const parseOptions = (argumentsList: string[]): Options => {
  let inputPath = "";
  let all = false;
  let dryRun = false;
  let quality = 85;

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === "--all") {
      all = true;
      continue;
    }

    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (argument === "--quality") {
      const suppliedQuality = Number(argumentsList[index + 1]);
      if (!Number.isInteger(suppliedQuality) || suppliedQuality < 1 || suppliedQuality > 100) {
        throw new Error("--quality must be an integer from 1 to 100.");
      }
      quality = suppliedQuality;
      index += 1;
      continue;
    }

    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (inputPath) {
      throw new Error("Provide exactly one input directory.");
    }
    inputPath = argument;
  }

  if (!inputPath) {
    throw new Error(usage);
  }

  return { inputPath: resolve(inputPath), all, dryRun, quality };
};

const getChapterDirectories = async ({ inputPath, all }: Options) => {
  const inputName = basename(inputPath);

  if (chapterPattern.test(inputName)) {
    if (all) {
      throw new Error("--all expects a series directory, not a chapter directory.");
    }
    return [inputPath];
  }

  if (!all) {
    throw new Error("Pass a chapter directory, or pass a series directory together with --all.");
  }

  const entries = await readdir(inputPath, { withFileTypes: true });
  const chapters = entries
    .filter((entry) => entry.isDirectory() && chapterPattern.test(entry.name))
    .map((entry) => join(inputPath, entry.name));

  if (chapters.length === 0) {
    throw new Error("No chapter-### directories were found.");
  }

  return sortMangaSourceFiles(chapters);
};

const getPages = async (chapterDirectory: string) => {
  const entries = await readdir(chapterDirectory, { withFileTypes: true });
  return sortMangaSourceFiles(entries.filter((entry) => entry.isFile() && isSupportedMangaImage(entry.name)).map((entry) => entry.name));
};

const runCwebp = async (source: string, destination: string, quality: number) => {
  if (source.toLowerCase().endsWith(".webp")) {
    await cp(source, destination);
    return;
  }

  const process = Bun.spawn(["cwebp", "-quiet", "-q", String(quality), source, "-o", destination], {
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`cwebp failed for ${basename(source)}.`);
  }
};

const sanitizeChapter = async (chapterDirectory: string, options: Options) => {
  const pages = await getPages(chapterDirectory);
  if (pages.length === 0) {
    throw new Error(`${basename(chapterDirectory)} has no supported image pages.`);
  }

  const mapping = pages.map((page, index) => `${page} -> ${createSanitizedPageName(index + 1)}`);
  console.log(`\n${basename(chapterDirectory)}: ${pages.length} pages`);
  for (const line of mapping) console.log(`  ${line}`);

  if (options.dryRun) return;

  const parentDirectory = dirname(chapterDirectory);
  const chapterName = basename(chapterDirectory);
  const transactionId = crypto.randomUUID();
  const stagingDirectory = join(parentDirectory, `.${chapterName}-sanitizing-${transactionId}`);
  const backupDirectory = join(parentDirectory, `.${chapterName}-backup-${transactionId}`);

  try {
    await mkdir(stagingDirectory);
    for (const [index, page] of pages.entries()) {
      await runCwebp(join(chapterDirectory, page), join(stagingDirectory, createSanitizedPageName(index + 1)), options.quality);
    }

    for (let index = 1; index <= pages.length; index += 1) {
      await stat(join(stagingDirectory, createSanitizedPageName(index)));
    }

    await rename(chapterDirectory, backupDirectory);
    try {
      await rename(stagingDirectory, chapterDirectory);
    } catch (error) {
      await rename(backupDirectory, chapterDirectory);
      throw error;
    }
    await rm(backupDirectory, { recursive: true, force: true });
    console.log(`  replaced originals with ${pages.length} WebP pages`);
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
};

try {
  const options = parseOptions(Bun.argv.slice(2));
  const chapters = await getChapterDirectories(options);
  for (const chapter of chapters) await sanitizeChapter(chapter, options);
  console.log(options.dryRun ? "\nDry run complete. No files changed." : "\nManga sanitization complete.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Manga sanitization failed: ${message}`);
  process.exit(1);
}
