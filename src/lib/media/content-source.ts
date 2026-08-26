import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export type MediaContentCollection =
  | "artifacts"
  | "animeTitles"
  | "animeVideos"
  | "imageSets"
  | "mangaSeries"
  | "mangaChapters"
  | "pages"
  | "signals"
  | "spheres"
  | "trails";

export type MediaContentEntry = {
  collection: MediaContentCollection;
  path: string;
  data: Record<string, unknown>;
  body: string;
};

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export const parseContentDocument = (
  source: string,
  path: string,
  collection: MediaContentCollection,
): MediaContentEntry => {
  const frontmatter = source.match(frontmatterPattern);
  if (!frontmatter) {
    throw new Error(`Invalid frontmatter in ${path}: expected --- delimiters`);
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatter[1]!);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid YAML frontmatter in ${path}: ${detail}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Invalid frontmatter in ${path}: expected an object`);
  }

  const data = parsed as Record<string, unknown>;
  if (typeof data.slug !== "string" || data.slug.trim().length === 0) {
    throw new Error(`Invalid frontmatter in ${path}: slug is required`);
  }

  return {
    collection,
    path,
    data,
    body: source.slice(frontmatter[0].length),
  };
};

export const collectionForContentPath = (
  relativePath: string,
): MediaContentCollection => {
  const path = relativePath.replaceAll("\\", "/");
  if (path.startsWith("artifacts/")) return "artifacts";
  if (path.startsWith("anime/titles/")) return "animeTitles";
  if (path.startsWith("anime/videos/")) return "animeVideos";
  if (path.startsWith("anime/")) {
    throw new Error(`Unexpected anime content path: ${relativePath}`);
  }
  if (path.startsWith("image-sets/")) return "imageSets";
  if (path.startsWith("manga/series/")) return "mangaSeries";
  if (path.startsWith("manga/chapters/")) return "mangaChapters";
  if (path.startsWith("manga/")) {
    throw new Error(`Unexpected manga content path: ${relativePath}`);
  }
  if (path.startsWith("pages/")) return "pages";
  if (path.startsWith("signals/")) return "signals";
  if (path.startsWith("spheres/")) return "spheres";
  if (path.startsWith("trails/")) return "trails";
  throw new Error(`Unexpected content path: ${relativePath}`);
};

export const isPublishedMediaEntry = (entry: MediaContentEntry): boolean =>
  entry.collection === "mangaSeries" || entry.collection === "animeTitles"
    ? entry.data.visibility === "published"
    : entry.data.status === "published";

export const loadMediaContentEntries = async (
  repoRoot = process.cwd(),
): Promise<MediaContentEntry[]> => {
  const glob = new Bun.Glob("src/content/**/*.{md,mdx}");
  const paths: string[] = [];
  for await (const path of glob.scan({ cwd: repoRoot, onlyFiles: true })) {
    paths.push(path.replaceAll("\\", "/"));
  }
  paths.sort();

  return Promise.all(
    paths.map(async (path) => {
      const contentPath = path.slice("src/content/".length);
      const collection = collectionForContentPath(contentPath);
      return parseContentDocument(
        await Bun.file(join(repoRoot, path)).text(),
        path,
        collection,
      );
    }),
  );
};
