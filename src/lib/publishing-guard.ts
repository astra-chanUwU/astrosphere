import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { isManagedMediaUrl } from "./media/paths";

export type PublishingIssue = {
  source: string;
  field: string;
  message: string;
};

export type PublishingAssetReference = {
  source: string;
  field: string;
  src: string;
};

export type PublishingUrlReference = {
  source: string;
  field: string;
  url: string;
};

type PublishingAssetValidationOptions = {
  publicRoot?: string;
  accessFile?: (path: string) => Promise<boolean>;
};

type GuardableEntry = {
  collection: string;
  data: Record<string, unknown>;
  body?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLocalSource = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("/");

const entrySource = (entry: GuardableEntry) =>
  `${entry.collection}:${entry.data.slug}`;

const addMediaReference = (
  references: PublishingAssetReference[],
  source: string,
  field: string,
  media: unknown,
) => {
  if (!isRecord(media)) return;
  if (isLocalSource(media.src))
    references.push({ source, field: `${field}.src`, src: media.src });
  if (isLocalSource(media.poster))
    references.push({ source, field: `${field}.poster`, src: media.poster });
};

export const collectPublishingAssetReferences = (
  entries: GuardableEntry[],
): PublishingAssetReference[] => {
  const references: PublishingAssetReference[] = [];

  for (const entry of entries) {
    const source = entrySource(entry);
    addMediaReference(references, source, "hero", entry.data.hero);
    addMediaReference(references, source, "cover", entry.data.cover);

    if (Array.isArray(entry.data.media)) {
      entry.data.media.forEach((media, index) =>
        addMediaReference(references, source, `media[${index}]`, media),
      );
    }
    if (Array.isArray(entry.data.art)) {
      entry.data.art.forEach((art, index) =>
        addMediaReference(references, source, `art[${index}]`, art),
      );
    }
    if (
      entry.collection === "mangaChapters" &&
      typeof entry.data.pagePath === "string" &&
      typeof entry.data.pageExtension === "string" &&
      typeof entry.data.pageCount === "number"
    ) {
      for (let page = 1; page <= entry.data.pageCount; page += 1) {
        references.push({
          source,
          field: `pages[${page}]`,
          src: `${entry.data.pagePath}/${String(page).padStart(3, "0")}.${entry.data.pageExtension}`,
        });
      }
    }
    if (entry.body) {
      for (const match of entry.body.matchAll(
        /!\[[^\]]*\]\((\/[^\s)]+)(?:\s+[^)]*)?\)/g,
      )) {
        references.push({ source, field: "body image", src: match[1] });
      }
    }
  }

  return references;
};

export const validatePublishingAssetReferences = async (
  references: PublishingAssetReference[],
  options: PublishingAssetValidationOptions = {},
): Promise<PublishingIssue[]> => {
  const publicRoot = resolve(
    options.publicRoot ?? resolve(process.cwd(), "public"),
  );
  const accessFile =
    options.accessFile ??
    (async (path: string) => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    });
  const issues: PublishingIssue[] = [];

  for (const reference of references) {
    const isManga = reference.src.startsWith("/manga/");
    if (isManga || isManagedMediaUrl(reference.src)) continue;
    const path = resolve(publicRoot, `.${reference.src}`);

    if (!(await accessFile(path))) {
      issues.push({
        source: reference.source,
        field: reference.field,
        message: `missing local file "${reference.src}"`,
      });
    }
  }
  return issues;
};

export const collectPublishingUrlReferences = (
  body: string,
  source: string,
): PublishingUrlReference[] =>
  [...body.matchAll(/(?<!!)\[[^\]]*\]\((https?:\/\/[^\s)]*)\)/g)].map(
    (match) => ({
      source,
      field: "body link",
      url: match[1],
    }),
  );

export const validatePublishingUrlReferences = (
  references: PublishingUrlReference[],
): PublishingIssue[] =>
  references.flatMap((reference) => {
    try {
      new URL(reference.url);
      return [];
    } catch {
      return [
        {
          source: reference.source,
          field: reference.field,
          message: `invalid URL "${reference.url}"`,
        },
      ];
    }
  });

export const validatePublishedTarget = ({
  source,
  field,
  target,
  targetStatus,
}: {
  source: string;
  field: string;
  target: string;
  targetStatus: "draft" | "published" | "archived" | undefined;
}): PublishingIssue | undefined =>
  targetStatus === "published"
    ? undefined
    : { source, field, message: `targets unpublished entry "${target}"` };
