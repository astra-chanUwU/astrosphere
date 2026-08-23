import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { stringify as stringifyYaml } from "yaml";

export type ContentTemplateType = "essay" | "doujinshi" | "image-set";

export type CreateContentTemplateOptions = {
  type: ContentTemplateType;
  slug: string;
  projectRoot: string;
  date: Date;
};

const titleFromSlug = (slug: string): string =>
  slug
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");

const document = (data: Record<string, unknown>, body: string): string =>
  `---\n${stringifyYaml(data, { lineWidth: 0 })
    .replace(/^(publishedAt|updatedAt): (\d{4}-\d{2}-\d{2})$/gm, '$1: "$2"')
    .trimEnd()}\n---\n\n${body.trim()}\n`;

export const renderContentTemplate = (
  type: ContentTemplateType,
  slug: string,
  date: Date,
): string => {
  const title = titleFromSlug(slug);
  const publishedAt = date.toISOString().slice(0, 10);
  if (type === "essay") {
    return document(
      {
        slug,
        title,
        type: "essay",
        status: "draft",
        summary: `Draft essay about ${title}.`,
        publishedAt,
        spheres: ["personal"],
        tags: [],
        featured: false,
        layout: "standard",
        media: [],
        related: [],
      },
      `# ${title}\n\nWrite the essay here.`,
    );
  }
  if (type === "doujinshi") {
    return document(
      {
        slug,
        title,
        originalTitle: title,
        aliases: [],
        visibility: "draft",
        status: "completed",
        publicationYear: date.getUTCFullYear(),
        description: `Draft doujinshi entry for ${title}.`,
        rating: "explicit",
        format: "doujinshi",
        origin: "original",
        tags: [],
        authors: [{ name: "Unknown", slug: "unknown" }],
        artists: [{ name: "Unknown", slug: "unknown" }],
        featured: false,
      },
      `*${title}* draft metadata.`,
    );
  }
  return document(
    {
      slug,
      title,
      status: "draft",
      summary: `Draft image set for ${title}.`,
      publishedAt,
      tags: [],
      featured: false,
      rating: "explicit",
      spheres: [],
      layout: "gallery",
      media: [],
    },
    `Image-set notes for *${title}*.`,
  );
};

const destinationFor = (
  type: ContentTemplateType,
  root: string,
  slug: string,
): string => {
  if (type === "essay") return join(root, "src/content/artifacts/essays", `${slug}.md`);
  if (type === "doujinshi") return join(root, "src/content/manga/series", `${slug}.md`);
  return join(root, "src/content/image-sets", `${slug}.md`);
};

const nextInstruction = (type: ContentTemplateType, slug: string): string => {
  if (type === "essay") return "Edit the Markdown body, then change status to published.";
  if (type === "doujinshi") {
    return `Add reader media with: bun run media:add manga-volume <archive> --series ${slug} --draft`;
  }
  return "Add gallery media with a reviewed media:add batch manifest.";
};

export const createContentTemplate = async (
  options: CreateContentTemplateOptions,
): Promise<{ path: string; next: string }> => {
  const root = resolve(options.projectRoot);
  const path = destinationFor(options.type, root, options.slug);
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(
      path,
      renderContentTemplate(options.type, options.slug, options.date),
      { flag: "wx" },
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw new Error(`Content destination already exists: ${path}`);
    }
    throw error;
  }
  return { path, next: nextInstruction(options.type, options.slug) };
};
