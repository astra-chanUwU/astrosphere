import rss from "@astrojs/rss";
import type { APIRoute } from "astro";

import { siteConfig } from "../config/site";
import { getPublishedArtifacts } from "../lib/content";

export const GET: APIRoute = async (context) => {
  const artifacts = await getPublishedArtifacts();

  return rss({
    title: siteConfig.archiveName,
    description: siteConfig.description,
    site: context.site ?? siteConfig.siteUrl,
    items: artifacts.map((artifact) => ({
      title: artifact.data.title,
      description: artifact.data.summary,
      pubDate: artifact.data.publishedAt,
      link: `/articles/${artifact.id}/`,
      categories: artifact.data.tags,
    })),
  });
};
