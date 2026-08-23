import { stringify as stringifyYaml } from "yaml";
import type {
  BatchChapter,
  DoujinshiCreateEntry,
  DoujinshiUpdateEntry,
  ImageSetEntry,
} from "./batch-manifest";

export type RenderedImage = {
  src: string;
  width: number;
  height: number;
};

export type ReaderMetadata = {
  pageCount: number;
  width: number;
  height: number;
};

const frontmatter = (data: Record<string, unknown>, body = ""): string => {
  const yaml = stringifyYaml(data, { lineWidth: 0 })
    .replace(/^(publishedAt|updatedAt): (\d{4}-\d{2}-\d{2})$/gm, '$1: "$2"')
    .trimEnd();
  return `---\n${yaml}\n---\n${body.trim().length > 0 ? `\n${body.trim()}\n` : ""}`;
};

export const batchChapterSegment = (number: number): string => {
  const [whole, decimal] = String(number).split(".");
  return `chapter-${whole!.padStart(3, "0")}${decimal ? `-${decimal}` : ""}`;
};

export const renderDoujinshiSeries = (
  entry: DoujinshiCreateEntry,
  cover: RenderedImage,
  visibility: "draft" | "published",
): string => {
  const series = entry.series;
  return frontmatter(
    {
      slug: series.slug,
      title: series.title,
      originalTitle: series.originalTitle,
      aliases: series.aliases,
      visibility,
      status: series.status,
      publicationYear: series.publicationYear,
      description: series.description,
      rating: series.rating,
      format: "doujinshi",
      origin: series.origin,
      tags: series.tags,
      authors: series.authors,
      artists: series.artists,
      cover: {
        kind: "image",
        src: cover.src,
        alt: `Cover art for ${series.title}`,
        width: cover.width,
        height: cover.height,
      },
      featured: series.featured,
    },
    `*${series.title}* is a ${series.status} doujinshi.`,
  );
};

export const renderDoujinshiChapter = (
  series: string,
  chapter: BatchChapter,
  media: ReaderMetadata,
  status: "draft" | "published",
): string => {
  const segment = batchChapterSegment(chapter.number);
  return frontmatter(
    {
      slug: `${series}-${segment}`,
      series,
      number: chapter.number,
      title: chapter.title ?? "Doujinshi",
      pagePath: `/manga/${series}/${segment}`,
      pageExtension: "webp",
      pageCount: media.pageCount,
      pageWidth: media.width,
      pageHeight: media.height,
      readingDirection: "rtl",
      status,
    },
    chapter.body ?? "The complete doujinshi.",
  );
};

const imageMedia = (
  image: RenderedImage,
  title: string,
  ordinal: number,
): Record<string, unknown> => ({
  kind: "image",
  src: image.src,
  alt: `${title} image ${String(ordinal).padStart(3, "0")}`,
  width: image.width,
  height: image.height,
});

export const renderImageSet = (
  entry: ImageSetEntry,
  images: RenderedImage[],
  status: "draft" | "published",
): string => {
  if (images.length === 0) throw new Error("Image set requires at least one image");
  const metadata = entry.imageSet;
  return frontmatter({
    slug: metadata.slug,
    title: metadata.title,
    status,
    summary: metadata.summary,
    publishedAt: metadata.publishedAt,
    spheres: metadata.spheres,
    tags: metadata.tags,
    featured: metadata.featured,
    rating: metadata.rating,
    layout: "gallery",
    ...(metadata.author === undefined ? {} : { author: metadata.author }),
    ...(metadata.notes === undefined ? {} : { notes: metadata.notes }),
    hero: imageMedia(images[0]!, metadata.title, 1),
    media: images.slice(1).map((image, index) =>
      imageMedia(image, metadata.title, index + 2),
    ),
  });
};

export type DoujinshiBatchEntry = DoujinshiCreateEntry | DoujinshiUpdateEntry;
