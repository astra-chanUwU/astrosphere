import { createHash } from "node:crypto";
import { isAbsolute, join } from "node:path";
import { isAlias, isScalar, parseDocument } from "yaml";
import type { MediaContentEntry } from "./content-source";
import type {
  MaintenanceContentEditV1,
  MaintenanceContentRewriteV1,
} from "./maintenance-types";
import { collectManagedMediaReferences, type MediaReference } from "./references";

type ReadText = (path: string) => string | Promise<string>;

const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const markdownImageExpression = /!\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+[^)]*)?\)/gd;
const htmlSourceExpression = /<[^>]+\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gid;

const sha256 = (source: string): string =>
  createHash("sha256").update(source, "utf8").digest("hex");

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const assertContentRelativePath = (path: string): void => {
  if (
    isAbsolute(path) ||
    /^[A-Za-z]:[\\/]/.test(path) ||
    path.includes("\\")
  ) {
    throw new Error(`Invalid content source path: ${path}`);
  }
  const segments = path.split("/");
  if (
    segments.length < 3 ||
    segments[0] !== "src" ||
    segments[1] !== "content" ||
    segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")
  ) {
    throw new Error(`Invalid content source path: ${path}`);
  }
};

const fieldToYamlPath = (field: string): Array<string | number> => {
  const path: Array<string | number> = [];
  const segmentPattern = /([^.[\]]+)|\[(\d+)\]/g;
  let consumed = 0;
  for (const match of field.matchAll(segmentPattern)) {
    if (match.index !== consumed && !(match.index === consumed + 1 && field[consumed] === ".")) {
      throw new Error(`Unsupported frontmatter field path: ${field}`);
    }
    path.push(match[1] === undefined ? Number(match[2]) : match[1]);
    consumed = match.index! + match[0].length;
  }
  if (consumed !== field.length || path.length === 0) {
    throw new Error(`Unsupported frontmatter field path: ${field}`);
  }
  return path;
};

const containsUnsafeYamlNode = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  if (isAlias(value)) return true;

  const item = value as { items?: unknown[]; key?: unknown; value?: unknown };
  if (isScalar(item.key) && item.key.value === "<<") return true;
  if (Array.isArray(item.items) && item.items.some(containsUnsafeYamlNode)) {
    return true;
  }
  return containsUnsafeYamlNode(item.key) || containsUnsafeYamlNode(item.value);
};

const scalarValueRange = (
  source: string,
  offset: number,
  field: string,
  expected: string,
): { start: number; end: number } => {
  const document = parseDocument(source, { keepSourceTokens: true });
  if (document.errors.length > 0) {
    throw new Error(`Invalid YAML frontmatter for ${field}: ${document.errors[0]!.message}`);
  }
  if (containsUnsafeYamlNode(document.contents)) {
    throw new Error(`Unsafe YAML alias or merged key for ${field}`);
  }

  const node = document.getIn(fieldToYamlPath(field), true);
  if (!isScalar(node) || typeof node.value !== "string" || !node.range) {
    throw new Error(`Expected a string YAML scalar for ${field}`);
  }
  if (node.value !== expected) {
    throw new Error(`Current YAML value for ${field} does not match the collected reference`);
  }

  let [start, end] = node.range;
  if (node.type === "QUOTE_DOUBLE" || node.type === "QUOTE_SINGLE") {
    start += 1;
    end -= 1;
  } else if (node.type !== "PLAIN") {
    throw new Error(`Unsupported YAML scalar style for ${field}`);
  }
  if (source.slice(start, end) !== expected) {
    throw new Error(`YAML source bytes for ${field} do not match the collected reference`);
  }
  return { start: offset + start, end: offset + end };
};

const extension = (path: string): string | undefined => {
  const match = /\.([A-Za-z0-9]+)$/.exec(path);
  return match?.[1]?.toLowerCase();
};

const appendEdit = (
  edits: MaintenanceContentEditV1[],
  start: number,
  end: number,
  before: string,
  after: string,
  field: string,
): void => {
  edits.push({ start, end, before, after, field });
};

const bodyEdits = (
  source: string,
  bodyOffset: number,
  references: MediaReference[],
  replacements: ReadonlyMap<string, string>,
): MaintenanceContentEditV1[] => {
  const byFieldAndPath = new Set(
    references.map((reference) => `${reference.field}\0${reference.publicPath}`),
  );
  const edits: MaintenanceContentEditV1[] = [];
  const collect = (expression: RegExp, field: "body.markdown" | "body.html") => {
    for (const match of source.matchAll(expression)) {
      const publicPath = match[1];
      if (!publicPath || !byFieldAndPath.has(`${field}\0${publicPath}`)) continue;
      const after = replacements.get(publicPath);
      if (!after) continue;
      const range = match.indices?.[1];
      if (!range) throw new Error(`Unable to locate ${field} reference ${publicPath}`);
      appendEdit(
        edits,
        bodyOffset + range[0],
        bodyOffset + range[1],
        publicPath,
        after,
        field,
      );
    }
  };
  collect(markdownImageExpression, "body.markdown");
  collect(htmlSourceExpression, "body.html");

  for (const reference of references) {
    if (!reference.field.startsWith("body.") || !replacements.has(reference.publicPath)) {
      continue;
    }
    if (!edits.some((edit) => edit.field === reference.field && edit.before === reference.publicPath)) {
      throw new Error(`Unable to locate collected ${reference.field} reference ${reference.publicPath}`);
    }
  }
  return edits;
};

const readerEdit = (
  frontmatter: string,
  frontmatterOffset: number,
  references: MediaReference[],
  replacements: ReadonlyMap<string, string>,
): MaintenanceContentEditV1 | undefined => {
  const pages = references.filter((reference) => /^pages\[\d+\]$/.test(reference.field));
  const replaced = pages.filter((reference) => replacements.has(reference.publicPath));
  if (replaced.length === 0) return undefined;
  if (replaced.length !== pages.length) {
    throw new Error("Manga reader rewrites require every page to be converted together");
  }

  const oldExtensions = new Set(pages.map((reference) => extension(reference.publicPath)));
  const destinationExtensions = new Set(
    replaced.map((reference) => extension(replacements.get(reference.publicPath)!)),
  );
  if (oldExtensions.size !== 1 || oldExtensions.has(undefined)) {
    throw new Error("Manga reader pages have mixed source extensions");
  }
  if (destinationExtensions.size !== 1 || destinationExtensions.has(undefined)) {
    throw new Error("Manga reader pages have mixed destination extensions");
  }
  if (!destinationExtensions.has("webp")) {
    throw new Error("Manga reader page destination extension must be webp");
  }

  const before = [...oldExtensions][0]!;
  const range = scalarValueRange(frontmatter, frontmatterOffset, "pageExtension", before);
  return {
    ...range,
    before,
    after: "webp",
    field: "pageExtension",
  };
};

const sourceText = async (path: string, readText?: ReadText): Promise<string> =>
  readText ? await readText(path) : Bun.file(path).text();

export const applyTextEdits = (
  source: string,
  edits: readonly MaintenanceContentEditV1[],
): string => {
  const sorted = [...edits].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 0; index < sorted.length; index += 1) {
    const edit = sorted[index]!;
    if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < 0 || edit.end <= edit.start || edit.end > source.length) {
      throw new Error(`Invalid text edit range for ${edit.field}`);
    }
    if (source.slice(edit.start, edit.end) !== edit.before) {
      throw new Error(`Text edit source mismatch for ${edit.field}`);
    }
    if (index > 0 && sorted[index - 1]!.end > edit.start) {
      throw new Error("Text edits overlap");
    }
  }

  let output = source;
  for (const edit of [...sorted].reverse()) {
    output = `${output.slice(0, edit.start)}${edit.after}${output.slice(edit.end)}`;
  }
  return output;
};

export const verifyContentRewrite = (
  source: string,
  record: MaintenanceContentRewriteV1,
): "pending" | "already-applied" => {
  const current = sha256(source);
  if (current === record.afterSha256) return "already-applied";
  if (current !== record.beforeSha256) {
    throw new Error(`Content rewrite is stale for ${record.relativePath}`);
  }
  if (sha256(applyTextEdits(source, record.edits)) !== record.afterSha256) {
    throw new Error(`Content rewrite record is stale for ${record.relativePath}`);
  }
  return "pending";
};

export const planMaintenanceContentRewrites = async (
  projectRoot: string,
  entries: MediaContentEntry[],
  replacements: ReadonlyMap<string, string>,
  readText?: ReadText,
  collectedReferences?: MediaReference[],
): Promise<MaintenanceContentRewriteV1[]> => {
  const referencesBySource = new Map<string, MediaReference[]>();
  for (const reference of collectedReferences ?? collectManagedMediaReferences(entries)) {
    const sourceReferences = referencesBySource.get(reference.source) ?? [];
    sourceReferences.push(reference);
    referencesBySource.set(reference.source, sourceReferences);
  }

  const rewrites: MaintenanceContentRewriteV1[] = [];
  for (const [relativePath, references] of [...referencesBySource.entries()].sort(([left], [right]) => compareCodeUnits(left, right))) {
    if (!references.some((reference) => replacements.has(reference.publicPath))) continue;
    assertContentRelativePath(relativePath);
    const source = await sourceText(join(projectRoot, relativePath), readText);
    const frontmatter = source.match(frontmatterPattern);
    if (!frontmatter || frontmatter.index === undefined) {
      throw new Error(`Invalid frontmatter in ${relativePath}: expected --- delimiters`);
    }
    const frontmatterOffset = frontmatter.index + frontmatter[0].indexOf(frontmatter[1]!);
    const bodyOffset = frontmatter[0].length;
    const edits: MaintenanceContentEditV1[] = [];

    for (const reference of references) {
      if (reference.field.startsWith("body.") || /^pages\[\d+\]$/.test(reference.field)) continue;
      const after = replacements.get(reference.publicPath);
      if (!after) continue;
      const range = scalarValueRange(
        frontmatter[1]!,
        frontmatterOffset,
        reference.field,
        reference.publicPath,
      );
      appendEdit(edits, range.start, range.end, reference.publicPath, after, reference.field);
    }

    edits.push(...bodyEdits(source.slice(bodyOffset), bodyOffset, references, replacements));
    const pageExtensionEdit = readerEdit(frontmatter[1]!, frontmatterOffset, references, replacements);
    if (pageExtensionEdit) edits.push(pageExtensionEdit);

    const sorted = edits.sort((left, right) => left.start - right.start || left.end - right.end);
    if (sorted.length === 0) continue;
    const output = applyTextEdits(source, sorted);
    rewrites.push({
      relativePath,
      beforeSha256: sha256(source),
      afterSha256: sha256(output),
      edits: sorted,
    });
  }
  return rewrites;
};
