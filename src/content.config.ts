import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { animeTitleSchema, animeVideoSchema } from "./lib/anime-schema";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

export const slugSchema = z
  .string()
  .regex(slugPattern, "Use lowercase letters, numbers, and hyphens only.");

export const isoDateSchema = z
  .string()
  .regex(isoDatePattern, "Use an ISO date such as 2026-07-31 or 2026-07-31T12:00:00Z.")
  .pipe(z.coerce.date());

export const tagSchema = slugSchema;

export const statusSchema = z.enum(["draft", "published", "archived"]);

export const artifactTypeSchema = z.enum([
  "essay",
  "note",
  "audio",
  "video",
  "link",
  "experiment",
  "reference",
]);

export const artifactLayoutSchema = z.enum([
  "standard",
  "feature",
  "gallery",
  "field-note",
  "experiment",
]);

export const spherePaletteSchema = z.enum([
  "paper",
  "moss",
  "ember",
  "ocean",
  "dusk",
  "mineral",
]);

export const mediaKindSchema = z.enum(["image", "audio", "video", "iframe", "embed"]);

const mediaSourceSchema = z.string().min(1).refine(
  (source) => source.startsWith("/") || /^https:\/\//.test(source),
  "Media sources must be root-relative paths or HTTPS URLs.",
);

export const mediaSchema = z.object({
  kind: mediaKindSchema,
  src: mediaSourceSchema,
  alt: z.string().optional(),
  title: z.string().optional(),
  caption: z.string().optional(),
  credit: z.string().optional(),
  poster: mediaSourceSchema.optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.string().optional(),
  loop: z.boolean().optional(),
  autoplay: z.boolean().optional(),
  muted: z.boolean().optional(),
});

export const artifactSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  type: artifactTypeSchema,
  status: statusSchema,
  summary: z.string().min(1),
  publishedAt: isoDateSchema,
  updatedAt: isoDateSchema.optional(),
  spheres: z.array(slugSchema).min(1),
  tags: z.array(tagSchema),
  featured: z.boolean().default(false),
  layout: artifactLayoutSchema.default("standard"),
  hero: mediaSchema.optional(),
  media: z.array(mediaSchema).default([]),
  related: z.array(slugSchema).default([]),
  externalUrl: z.url().optional(),
  sourceUrl: z.url().optional(),
  author: z.string().optional(),
  location: z.string().optional(),
  duration: z.string().optional(),
  transcript: z.string().optional(),
  credits: z.array(z.string()).default([]),
  canonicalUrl: z.url().optional(),
  notes: z.string().optional(),
});

export const imageSetSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  status: statusSchema,
  summary: z.string().min(1),
  publishedAt: isoDateSchema,
  updatedAt: isoDateSchema.optional(),
  tags: z.array(tagSchema).default([]),
  featured: z.boolean().default(false),
  rating: z.enum(["safe", "suggestive", "explicit"]).default("safe"),
  spheres: z.array(slugSchema).default([]),
  layout: artifactLayoutSchema.optional(),
  hero: mediaSchema.optional(),
  media: z.array(mediaSchema).default([]),
  related: z.array(slugSchema).default([]),
  sourceUrl: z.url().optional(),
  author: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  credits: z.array(z.string()).default([]),
});

export const sphereSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  status: statusSchema,
  summary: z.string().min(1),
  palette: spherePaletteSchema,
  order: z.number().int().default(0),
  parent: slugSchema.optional(),
  cover: mediaSchema.optional(),
  featured: z.boolean().default(false),
  accentLabel: z.string().optional(),
  shortLabel: z.string().optional(),
  updatedAt: isoDateSchema.optional(),
});

export const trailItemSchema = z.object({
  kind: z.enum(["artifact", "sphere", "signal"]),
  slug: slugSchema,
  note: z.string().optional(),
});

export const trailSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  status: statusSchema,
  summary: z.string().min(1),
  spheres: z.array(slugSchema).default([]),
  featured: z.boolean().default(false),
  estimatedTime: z.string().optional(),
  updatedAt: isoDateSchema.optional(),
  items: z.array(trailItemSchema).min(1),
});

export const pageSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  status: statusSchema,
  pageType: z.enum(["about", "philosophy", "manifest", "contact", "work", "custom"]),
  summary: z.string().optional(),
  updatedAt: isoDateSchema.optional(),
  featured: z.boolean().default(false),
});

const creatorSchema = z.object({
  name: z.string().min(1),
  slug: slugSchema,
});

const mangaRatingSchema = z.enum(["safe", "suggestive", "explicit"]);
const mangaFormatSchema = z.enum(["manga", "doujinshi", "one-shot", "artbook", "web-comic"]);
const mangaOriginSchema = z.enum(["original", "fanwork"]);

export const signalSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  url: z.url(),
  status: statusSchema,
  summary: z.string().min(1),
  spheres: z.array(slugSchema).default([]),
  tags: z.array(tagSchema).default([]),
  category: z.enum(["manga", "art-imageboards", "hentai-reading", "anime", "anime-physical", "community"]),
  rating: z.enum(["sfw", "mixed", "nsfw"]),
  visitedAt: isoDateSchema,
});

const mangaArtworkSchema = z.object({
  src: mediaSourceSchema,
  alt: z.string().min(1),
  caption: z.string().optional(),
});

const mangaSeriesSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  originalTitle: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  visibility: statusSchema.default("published"),
  status: z.enum(["ongoing", "completed", "hiatus", "cancelled"]),
  publicationYear: z.number().int().min(1800).max(2100),
  description: z.string().min(1),
  rating: mangaRatingSchema,
  format: mangaFormatSchema,
  origin: mangaOriginSchema,
  tags: z.array(slugSchema).default([]),
  authors: z.array(creatorSchema).min(1),
  artists: z.array(creatorSchema).min(1),
  cover: mediaSchema.optional(),
  art: z.array(mangaArtworkSchema).default([]),
  featured: z.boolean().default(false),
  updatedAt: isoDateSchema.optional(),
});

const mangaChapterSchema = z.object({
  slug: slugSchema,
  series: slugSchema,
  number: z.number().positive(),
  title: z.string().min(1),
  publishedAt: isoDateSchema.optional(),
  availability: z.enum(["available", "unavailable"]).default("available"),
  pagePath: z.string().startsWith("/").optional(),
  pageExtension: z.enum(["jpg", "jpeg", "png", "webp"]).default("jpg"),
  pageCount: z.number().int().positive().optional(),
  pageWidth: z.number().int().positive().optional(),
  pageHeight: z.number().int().positive().optional(),
  readingDirection: z.enum(["rtl", "ltr"]).optional().default("rtl"),
  status: statusSchema,
}).superRefine((chapter, context) => {
  const readerFields = [
    chapter.pagePath,
    chapter.pageCount,
    chapter.pageWidth,
    chapter.pageHeight,
  ];
  if (chapter.availability === "available" && readerFields.some((value) => value === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Available manga chapters require complete reader metadata.",
    });
  }
});

const slugFromFrontmatter = ({ data, entry }: { data: Record<string, unknown>; entry: string }) => {
  if (typeof data.slug === "string") return data.slug;

  return `invalid-${entry.replace(/\.(md|mdx)$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
};

const artifacts = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/artifacts",
    generateId: slugFromFrontmatter,
  }),
  schema: artifactSchema,
});

const spheres = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/spheres",
    generateId: slugFromFrontmatter,
  }),
  schema: sphereSchema,
});

const trails = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/trails",
    generateId: slugFromFrontmatter,
  }),
  schema: trailSchema,
});

const pages = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/pages",
    generateId: slugFromFrontmatter,
  }),
  schema: pageSchema,
});

const mangaSeries = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/manga/series",
    generateId: slugFromFrontmatter,
  }),
  schema: mangaSeriesSchema,
});

const mangaChapters = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/manga/chapters",
    generateId: slugFromFrontmatter,
  }),
  schema: mangaChapterSchema,
});

const signals = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/signals",
    generateId: slugFromFrontmatter,
  }),
  schema: signalSchema,
});

const imageSets = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/image-sets",
    generateId: slugFromFrontmatter,
  }),
  schema: imageSetSchema,
});

const animeTitles = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/anime/titles",
    generateId: slugFromFrontmatter,
  }),
  schema: animeTitleSchema,
});

const animeVideos = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: "./src/content/anime/videos",
    generateId: slugFromFrontmatter,
  }),
  schema: animeVideoSchema,
});

export const collections = {
  artifacts,
  spheres,
  trails,
  pages,
  mangaSeries,
  mangaChapters,
  signals,
  imageSets,
  animeTitles,
  animeVideos,
};
