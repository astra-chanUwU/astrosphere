import { isAbsolute, posix, win32 } from "node:path";
import { parse as parseYaml } from "yaml";

export type VideoStreamSelector = {
  language?: string;
  title?: string;
  index?: number;
};

export type VideoManifestVariant = {
  label: string;
  source: string;
  output: string;
  audio: VideoStreamSelector;
  subtitle?: VideoStreamSelector & { mode: "burn" | "none" };
};

export type VideoManifest = {
  version: 1;
  title: string;
  variants: VideoManifestVariant[];
};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const objectValue = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const requiredText = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
};

const selector = (value: unknown, label: string): VideoStreamSelector => {
  const object = objectValue(value, `${label} selector`);
  const language = object.language === undefined ? undefined : requiredText(object.language, `${label} selector language`);
  const title = object.title === undefined ? undefined : requiredText(object.title, `${label} selector title`);
  const index = object.index;
  if (index !== undefined && (!Number.isInteger(index) || (index as number) < 0)) {
    throw new Error(`${label} selector index must be a non-negative integer`);
  }
  if (index !== undefined && (language !== undefined || title !== undefined)) {
    throw new Error(`${label} selector index cannot be combined with language or title`);
  }
  if (index === undefined && language === undefined && title === undefined) {
    throw new Error(`${label} selector requires language, title, or index`);
  }
  return {
    ...(language === undefined ? {} : { language }),
    ...(title === undefined ? {} : { title }),
    ...(index === undefined ? {} : { index: index as number }),
  };
};

const safeSource = (value: unknown): string => {
  const source = requiredText(value, "variant source").replaceAll("\\", "/");
  if (isAbsolute(source) || win32.isAbsolute(source)) {
    throw new Error("variant source must be relative to the supplied source root");
  }
  const segments = source.split("/");
  if (
    source.includes("\0") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("variant source must stay inside the supplied source root");
  }
  return segments.join("/");
};

const safeOutput = (value: unknown, title: string): string => {
  const output = requiredText(value, "variant output");
  if (!output.toLowerCase().endsWith(".webm")) {
    throw new Error("variant output must end in .webm");
  }
  const prefix = `/media/anime/${title}/videos/`;
  if (!output.startsWith(prefix)) {
    throw new Error(`variant output must be beneath ${prefix}`);
  }
  const normalized = posix.normalize(output);
  if (normalized !== output || output.includes("\0") || output.includes("\\")) {
    throw new Error("variant output must be a normalized managed media path");
  }
  return output;
};

export const parseVideoManifest = (source: string, path: string): VideoManifest => {
  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    throw new Error(`Invalid video manifest YAML in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const root = objectValue(parsed, `video manifest ${path}`);
  if (root.version !== 1) throw new Error("video manifest version must be 1");
  const title = requiredText(root.title, "video manifest title");
  if (!slugPattern.test(title)) {
    throw new Error("video manifest title must use lowercase letters, numbers, and hyphens only");
  }
  if (!Array.isArray(root.variants) || root.variants.length === 0) {
    throw new Error("video manifest variants must contain at least one item");
  }

  const outputs = new Set<string>();
  const variants = root.variants.map((value, index): VideoManifestVariant => {
    const item = objectValue(value, `variant ${index + 1}`);
    const output = safeOutput(item.output, title);
    const outputKey = output.normalize("NFC").toLowerCase();
    if (outputs.has(outputKey)) throw new Error(`video manifest has duplicate output: ${output}`);
    outputs.add(outputKey);
    const parsedSubtitle = item.subtitle === undefined
      ? undefined
      : (() => {
          const subtitleObject = objectValue(item.subtitle, `variant ${index + 1} subtitle`);
          if (subtitleObject.mode !== "burn" && subtitleObject.mode !== "none") {
            throw new Error(`variant ${index + 1} subtitle mode must be burn or none`);
          }
          const mode: "burn" | "none" = subtitleObject.mode;
          const { mode: _mode, ...selectorObject } = subtitleObject;
          return { ...selector(selectorObject, `variant ${index + 1} subtitle`), mode };
        })();
    return {
      label: requiredText(item.label, `variant ${index + 1} label`),
      source: safeSource(item.source),
      output,
      audio: selector(item.audio, `variant ${index + 1} audio`),
      ...(parsedSubtitle === undefined ? {} : { subtitle: parsedSubtitle }),
    };
  });

  return { version: 1, title, variants };
};
