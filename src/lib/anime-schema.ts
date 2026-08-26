import { z } from "astro/zod";

const slugSchema = z.string().regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Use lowercase letters, numbers, and hyphens only.",
);
const statusSchema = z.enum(["draft", "published", "archived"]);
const managedAnimeImageSchema = z.string().regex(
  /^\/media\/anime\/[a-z0-9]+(?:-[a-z0-9]+)*\/.+\.(?:avif|gif|jpe?g|png|webp)$/i,
  "Anime artwork must use a managed /media/anime/ image URL.",
);
const animeArtworkSchema = z.object({
  src: managedAnimeImageSchema,
  alt: z.string().min(1),
  caption: z.string().optional(),
  credit: z.string().optional(),
});
const animeSourceSchema = z.object({
  label: z.string().min(1),
  url: z.url(),
  credit: z.string().optional(),
});

export const animeTitleSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1),
  originalTitle: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  visibility: statusSchema.default("published"),
  status: z.enum(["ongoing", "completed", "hiatus", "cancelled"]),
  kind: z.enum(["series", "movie"]),
  format: z.enum(["tv", "tv-short", "film", "ova", "ova-compilation"]),
  releaseYear: z.number().int().min(1900).max(2100),
  description: z.string().min(1),
  rating: z.enum(["safe", "suggestive", "explicit"]),
  contentWarnings: z.array(z.string().min(1)).default([]),
  tags: z.array(slugSchema).default([]),
  studios: z.array(z.string().min(1)).min(1),
  directors: z.array(z.string().min(1)).min(1),
  poster: animeArtworkSchema.optional(),
  art: z.array(animeArtworkSchema).default([]),
  featured: z.boolean().default(false),
  updatedAt: z.coerce.date().optional(),
  sources: z.array(animeSourceSchema).min(1),
});

export const animeVariantSchema = z.object({
  slug: slugSchema,
  label: z.string().min(1),
  language: z.string().min(1),
  subtitles: z.string().min(1),
  src: z.string().regex(
    /^\/media\/anime\/[a-z0-9]+(?:-[a-z0-9]+)*\/.+\.webm$/,
    "Anime video variants must use a managed /media/anime/ WebM URL.",
  ),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const animeVideoSchema = z.object({
  slug: slugSchema,
  anime: slugSchema,
  kind: z.enum(["episode", "movie", "extra"]),
  number: z.number().positive().optional(),
  title: z.string().min(1),
  originalTitle: z.string().min(1).optional(),
  releasedAt: z.coerce.date().optional(),
  durationSeconds: z.number().positive(),
  status: statusSchema,
  poster: animeArtworkSchema.optional(),
  defaultVariant: slugSchema,
  variants: z.array(animeVariantSchema).min(1),
}).superRefine((video, context) => {
  if (video.kind === "episode" && video.number === undefined) {
    context.addIssue({ code: "custom", path: ["number"], message: "Episodes require a positive number." });
  }
  if (video.kind === "movie" && video.number !== undefined) {
    context.addIssue({ code: "custom", path: ["number"], message: "Movie items cannot have an episode number." });
  }
  const variantSlugs = video.variants.map((variant) => variant.slug);
  if (new Set(variantSlugs).size !== variantSlugs.length) {
    context.addIssue({ code: "custom", path: ["variants"], message: "Variant slugs must be unique." });
  }
  if (!variantSlugs.includes(video.defaultVariant)) {
    context.addIssue({ code: "custom", path: ["defaultVariant"], message: "Default variant must name an existing variant." });
  }
  const expectedPrefix = `/media/anime/${video.anime}/`;
  video.variants.forEach((variant, index) => {
    if (!variant.src.startsWith(expectedPrefix)) {
      context.addIssue({
        code: "custom",
        path: ["variants", index, "src"],
        message: `Variant source must belong to ${video.anime}.`,
      });
    }
  });
});

export type AnimeTitle = z.infer<typeof animeTitleSchema>;
export type AnimeVideo = z.infer<typeof animeVideoSchema>;
export type AnimeVariant = z.infer<typeof animeVariantSchema>;
