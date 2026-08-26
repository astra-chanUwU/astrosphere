import type * as z from "astro/zod";

import type {
  artifactLayoutSchema,
  artifactSchema,
  artifactTypeSchema,
  imageSetSchema,
  mediaSchema,
  pageSchema,
  signalSchema,
  sphereSchema,
  statusSchema,
  trailItemSchema,
  trailSchema,
} from "../content.config";
import type { animeTitleSchema, animeVideoSchema, animeVariantSchema } from "../lib/anime-schema";

export type ContentStatus = z.infer<typeof statusSchema>;
export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type ArtifactLayout = z.infer<typeof artifactLayoutSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type TrailItem = z.infer<typeof trailItemSchema>;

export type Artifact = z.infer<typeof artifactSchema>;
export type Sphere = z.infer<typeof sphereSchema>;
export type Trail = z.infer<typeof trailSchema>;
export type Page = z.infer<typeof pageSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type ImageSet = z.infer<typeof imageSetSchema>;
export type AnimeTitle = z.infer<typeof animeTitleSchema>;
export type AnimeVideo = z.infer<typeof animeVideoSchema>;
export type AnimeVariant = z.infer<typeof animeVariantSchema>;
