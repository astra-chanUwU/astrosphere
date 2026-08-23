import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { parse as parseYaml } from "yaml";

export type PageSelection = "all" | { from: number; to: number };

export type BatchCreator = { name: string; slug: string };

export type DoujinshiSeriesMetadata = {
  slug: string;
  title: string;
  originalTitle: string;
  aliases: string[];
  status: "ongoing" | "completed" | "hiatus" | "cancelled";
  publicationYear: number;
  description: string;
  rating: "safe" | "suggestive" | "explicit";
  origin: "original" | "fanwork";
  tags: string[];
  authors: BatchCreator[];
  artists: BatchCreator[];
  featured: boolean;
};

export type BatchChapter = {
  number: number;
  title?: string;
  pages: PageSelection;
  body?: string;
};

export type DoujinshiCreateEntry = {
  type: "doujinshi";
  archive: string;
  mode: "create";
  series: DoujinshiSeriesMetadata;
  chapters: BatchChapter[];
};

export type DoujinshiUpdateEntry = {
  type: "doujinshi";
  archive: string;
  mode: "update";
  series: string;
  replace: true;
  chapters: BatchChapter[];
};

export type ImageSetMetadata = {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  rating: "safe" | "suggestive" | "explicit";
  tags: string[];
  spheres: string[];
  featured: boolean;
  author?: string;
  notes?: string;
};

export type ImageSetEntry = {
  type: "image-set";
  archive: string;
  mode: "create";
  imageSet: ImageSetMetadata;
};

export type BatchEntry =
  | DoujinshiCreateEntry
  | DoujinshiUpdateEntry
  | ImageSetEntry;

export type BatchManifest = {
  version: 1;
  defaults: { ignoreEntries: string[] };
  entries: BatchEntry[];
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
};

const exactKeys = (
  value: Record<string, unknown>,
  allowed: string[],
  label: string,
): void => {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${label} has unknown field: ${unknown[0]}`);
  }
};

const string = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const boolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
};

const enumValue = <T extends string>(
  value: unknown,
  accepted: readonly T[],
  label: string,
): T => {
  if (typeof value !== "string" || !accepted.includes(value as T)) {
    throw new Error(`${label} must be ${accepted.join(", ")}`);
  }
  return value as T;
};

const slug = (value: unknown, label: string): string => {
  const parsed = string(value, label);
  if (!slugPattern.test(parsed)) {
    throw new Error(`${label} must use lowercase letters, numbers, and hyphens`);
  }
  return parsed;
};

const stringArray = (
  value: unknown,
  label: string,
  item: (value: unknown, label: string) => string = string,
): string[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((entry, index) => item(entry, `${label}[${index}]`));
};

const archiveBasename = (value: unknown, label: string): string => {
  const parsed = string(value, label);
  if (
    basename(parsed) !== parsed ||
    parsed.includes("\\") ||
    parsed === "." ||
    parsed === ".."
  ) {
    throw new Error(`${label} must be a basename`);
  }
  if (!/\.(?:zip|cbz)$/i.test(parsed)) {
    throw new Error(`${label} must end in .zip or .cbz`);
  }
  return parsed;
};

const creators = (value: unknown, label: string): BatchCreator[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must contain at least one creator`);
  }
  return value.map((entry, index) => {
    const item = record(entry, `${label}[${index}]`);
    exactKeys(item, ["name", "slug"], `${label}[${index}]`);
    return {
      name: string(item.name, `${label}[${index}].name`),
      slug: slug(item.slug, `${label}[${index}].slug`),
    };
  });
};

const pages = (value: unknown, label: string): PageSelection => {
  if (value === "all") return "all";
  const range = record(value, label);
  exactKeys(range, ["from", "to"], label);
  if (!Number.isInteger(range.from) || Number(range.from) < 1) {
    throw new Error(`${label}.from must be a positive integer`);
  }
  if (!Number.isInteger(range.to) || Number(range.to) < Number(range.from)) {
    throw new Error(`${label}.to must be an integer at least as large as from`);
  }
  return { from: Number(range.from), to: Number(range.to) };
};

const chapters = (value: unknown, label: string): BatchChapter[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must contain at least one chapter`);
  }
  const parsed = value.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    const item = record(entry, itemLabel);
    exactKeys(item, ["number", "title", "pages", "body"], itemLabel);
    if (typeof item.number !== "number" || !Number.isFinite(item.number) || item.number <= 0) {
      throw new Error(`${itemLabel}.number must be a positive number`);
    }
    return {
      number: item.number,
      ...(item.title === undefined ? {} : { title: string(item.title, `${itemLabel}.title`) }),
      pages: pages(item.pages, `${itemLabel}.pages`),
      ...(item.body === undefined ? {} : { body: string(item.body, `${itemLabel}.body`) }),
    };
  });
  if (new Set(parsed.map((chapter) => chapter.number)).size !== parsed.length) {
    throw new Error(`${label} has duplicate chapter numbers`);
  }
  if (parsed.some((chapter) => chapter.pages === "all") && parsed.length !== 1) {
    throw new Error(`${label} may use pages: all only for a single chapter`);
  }
  const ranges = parsed
    .map((chapter) => chapter.pages)
    .filter((selection): selection is { from: number; to: number } => selection !== "all")
    .sort((left, right) => left.from - right.from);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index]!.from <= ranges[index - 1]!.to) {
      throw new Error(`${label} page ranges overlap`);
    }
  }
  return parsed;
};

const seriesMetadata = (value: unknown, label: string): DoujinshiSeriesMetadata => {
  const item = record(value, label);
  exactKeys(
    item,
    [
      "slug", "title", "originalTitle", "aliases", "status",
      "publicationYear", "description", "rating", "origin", "tags",
      "authors", "artists", "featured",
    ],
    label,
  );
  if (
    !Number.isInteger(item.publicationYear) ||
    Number(item.publicationYear) < 1800 ||
    Number(item.publicationYear) > 2100
  ) {
    throw new Error(`${label}.publicationYear must be an integer from 1800 to 2100`);
  }
  return {
    slug: slug(item.slug, `${label}.slug`),
    title: string(item.title, `${label}.title`),
    originalTitle: string(item.originalTitle, `${label}.originalTitle`),
    aliases: stringArray(item.aliases, `${label}.aliases`),
    status: enumValue(item.status, ["ongoing", "completed", "hiatus", "cancelled"], `${label}.status`),
    publicationYear: Number(item.publicationYear),
    description: string(item.description, `${label}.description`),
    rating: enumValue(item.rating, ["safe", "suggestive", "explicit"], `${label}.rating`),
    origin: enumValue(item.origin, ["original", "fanwork"], `${label}.origin`),
    tags: stringArray(item.tags, `${label}.tags`, slug),
    authors: creators(item.authors, `${label}.authors`),
    artists: creators(item.artists, `${label}.artists`),
    featured: boolean(item.featured, `${label}.featured`),
  };
};

const imageSetMetadata = (value: unknown, label: string): ImageSetMetadata => {
  const item = record(value, label);
  exactKeys(
    item,
    ["slug", "title", "summary", "publishedAt", "rating", "tags", "spheres", "featured", "author", "notes"],
    label,
  );
  const publishedAt = string(item.publishedAt, `${label}.publishedAt`);
  if (!isoDatePattern.test(publishedAt)) {
    throw new Error(`${label}.publishedAt must use YYYY-MM-DD`);
  }
  return {
    slug: slug(item.slug, `${label}.slug`),
    title: string(item.title, `${label}.title`),
    summary: string(item.summary, `${label}.summary`),
    publishedAt,
    rating: enumValue(item.rating, ["safe", "suggestive", "explicit"], `${label}.rating`),
    tags: stringArray(item.tags, `${label}.tags`, slug),
    spheres: stringArray(item.spheres, `${label}.spheres`, slug),
    featured: boolean(item.featured, `${label}.featured`),
    ...(item.author === undefined ? {} : { author: string(item.author, `${label}.author`) }),
    ...(item.notes === undefined ? {} : { notes: string(item.notes, `${label}.notes`) }),
  };
};

const parseEntry = (value: unknown, index: number): BatchEntry => {
  const label = `entries[${index}]`;
  const item = record(value, label);
  const type = enumValue(item.type, ["doujinshi", "image-set"], `${label}.type`);
  const archive = archiveBasename(item.archive, `${label}.archive`);
  const mode = enumValue(item.mode, ["create", "update"], `${label}.mode`);

  if (type === "image-set") {
    exactKeys(item, ["type", "archive", "mode", "imageSet"], label);
    if (mode !== "create") throw new Error(`${label}.mode must be create for image-set`);
    return {
      type,
      archive,
      mode,
      imageSet: imageSetMetadata(item.imageSet, `${label}.imageSet`),
    };
  }

  if (mode === "create") {
    exactKeys(item, ["type", "archive", "mode", "series", "chapters"], label);
    return {
      type,
      archive,
      mode,
      series: seriesMetadata(item.series, `${label}.series`),
      chapters: chapters(item.chapters, `${label}.chapters`),
    };
  }

  exactKeys(item, ["type", "archive", "mode", "series", "replace", "chapters"], label);
  if (item.replace !== true) throw new Error(`${label} update requires replace: true`);
  return {
    type,
    archive,
    mode,
    series: slug(item.series, `${label}.series`),
    replace: true,
    chapters: chapters(item.chapters, `${label}.chapters`),
  };
};

export const parseBatchManifest = (source: string, path: string): BatchManifest => {
  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    throw new Error(`${path}: invalid YAML: ${error instanceof Error ? error.message : String(error)}`);
  }
  const root = record(parsed, path);
  exactKeys(root, ["version", "defaults", "entries"], path);
  if (root.version !== 1) throw new Error(`${path}: version must be 1`);
  const defaults = record(root.defaults, `${path}.defaults`);
  exactKeys(defaults, ["ignoreEntries"], `${path}.defaults`);
  const ignoreEntries = stringArray(defaults.ignoreEntries, `${path}.defaults.ignoreEntries`);
  if (!Array.isArray(root.entries) || root.entries.length === 0) {
    throw new Error(`${path}.entries must contain at least one entry`);
  }
  const rawArchives = root.entries.map((entry, index) =>
    archiveBasename(record(entry, `entries[${index}]`).archive, `entries[${index}].archive`),
  );
  if (new Set(rawArchives).size !== rawArchives.length) {
    throw new Error(`${path}: archive is listed more than once`);
  }
  const entries = root.entries.map(parseEntry);
  const slugs = entries.map((entry) =>
    entry.type === "image-set"
      ? entry.imageSet.slug
      : typeof entry.series === "string"
        ? entry.series
        : entry.series.slug,
  );
  if (new Set(slugs).size !== slugs.length) {
    throw new Error(`${path}: target slug is listed more than once`);
  }
  return { version: 1, defaults: { ignoreEntries }, entries };
};

export const loadBatchManifest = async (path: string): Promise<BatchManifest> =>
  parseBatchManifest(await readFile(path, "utf8"), path);

const sortObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])]),
  );
};

export const fingerprintBatchEntry = (
  entry: BatchEntry,
  archiveSha256: string,
): string =>
  createHash("sha256")
    .update(JSON.stringify(sortObjectKeys({ entry, archiveSha256 })))
    .digest("hex");
