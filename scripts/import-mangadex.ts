#!/usr/bin/env bun

import { requireMangaMediaRoot } from "../src/lib/manga-media-root";

/** Import one MangaDex title and its English chapters into AstroSphere.
 *
 * Usage:
 *   bun scripts/import-mangadex.ts <mangadex-url> [--dry-run]
 */

const API = (Bun.env.MANGADEX_API_URL ?? "https://api.mangadex.org").replace(/\/$/, "");
const ROOT = import.meta.dir.replace(/\/scripts$/, "");
const SERIES_DIR = `${ROOT}/src/content/manga/series`;
const CHAPTER_DIR = `${ROOT}/src/content/manga/chapters`;
const MANGA_MEDIA_ROOT = requireMangaMediaRoot(Bun.env.MANGA_MEDIA_ROOT);
const dryRun = Bun.argv.includes("--dry-run");
const input = Bun.argv.find((arg) => arg.startsWith("http"));

if (!input) throw new Error("Give me a MangaDex title URL.");

const match = input.match(/\/title\/([0-9a-f-]{36})/i);
if (!match) throw new Error("That does not look like a MangaDex title URL.");
const mangaId = match[1];

const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled";
const yaml = (value: unknown): string => {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `${key}: ${yaml(item)}`)
      .join("\n");
  }
  return JSON.stringify(value ?? "");
};
const get = async (path: string) => {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error([
      `Cannot reach MangaDex at ${API}.`,
      `The importer did not reach the title or chapter data: ${detail}`,
      "Check DNS/VPN/firewall access, then retry. You can also set MANGADEX_API_URL to a reachable API proxy.",
    ].join("\n"));
  }
  if (!response.ok) throw new Error(`MangaDex returned HTTP ${response.status}: ${path}`);
  return response.json();
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const mangaResponse = await get(`/manga/${mangaId}?includes[]=author&includes[]=artist&includes[]=cover_art`);
const manga = mangaResponse.data;
const relationships = manga.relationships ?? [];
const rel = (type: string) => relationships.filter((item: any) => item.type === type);
const english = (value: Record<string, string> = {}) => value.en ?? Object.values(value)[0] ?? "";
const title = english(manga.attributes.title);
const seriesSlug = slugify(title);
const creators = (type: string) => rel(type).map((item: any) => ({ name: item.attributes?.name ?? item.id, slug: slugify(item.attributes?.name ?? item.id) }));
const cover = rel("cover_art")[0]?.attributes?.fileName;
const statusMap: Record<string, string> = { ongoing: "ongoing", completed: "completed", hiatus: "hiatus", cancelled: "cancelled" };
const formatMap: Record<string, string> = { manga: "manga", doujinshi: "doujinshi", one_shot: "one-shot", webtoon: "web-comic", comic: "web-comic" };
const ratingMap: Record<string, string> = { safe: "safe", suggestive: "suggestive", erotica: "explicit", pornographic: "explicit" };
const tags = (manga.attributes.tags ?? []).map((tag: any) => slugify(english(tag.attributes?.name))).filter(Boolean);
const publicationYear = Number(String(manga.attributes.year ?? new Date().getUTCFullYear()));
const date = new Date().toISOString().slice(0, 10);

const chapters: any[] = [];
for (let offset = 0; ; offset += 100) {
  const page = await get(`/chapter?manga[]=${mangaId}&translatedLanguage[]=en&includes[]=scanlation_group&order[volume]=asc&order[chapter]=asc&limit=100&offset=${offset}`);
  chapters.push(...page.data);
  if (chapters.length >= page.total || page.data.length === 0) break;
}

const usedSlugs = new Set<string>();
const chapterRows: Array<{ data: any; pages: string[]; hash: string; path: string }> = [];
for (const chapter of chapters) {
  let chapterSlug = `${seriesSlug}-chapter-${String(chapter.attributes.chapter ?? "0").replace(/\./g, "-")}`;
  if (usedSlugs.has(chapterSlug)) chapterSlug += `-${chapter.id.slice(0, 8)}`;
  usedSlugs.add(chapterSlug);
  const pageInfo = await get(`/at-home/server/${chapter.id}`);
  const pages = pageInfo.chapter.data;
  chapterRows.push({ data: chapter, pages, hash: pageInfo.chapter.hash, path: chapterSlug });
  await sleep(80);
}

console.log(`${title}: ${chapters.length} English chapters`);
if (dryRun) {
  for (const chapter of chapterRows) console.log(`  ${chapter.path}: ${chapter.pages.length} pages — ${chapter.data.attributes.title ?? ""}`);
  process.exit(0);
}

await Bun.$`mkdir -p ${SERIES_DIR} ${CHAPTER_DIR} ${MANGA_MEDIA_ROOT}/${seriesSlug}`;
await Bun.write(`${SERIES_DIR}/${seriesSlug}.md`, `---\n${yaml({
  slug: seriesSlug,
  title,
  originalTitle: english(manga.attributes.altTitles?.[0] ?? manga.attributes.title),
  aliases: Object.values(manga.attributes.altTitles ?? {}).flatMap((item: any) => Object.values(item)),
  visibility: "published",
  status: statusMap[manga.attributes.status] ?? "ongoing",
  publicationYear,
  description: english(manga.attributes.description),
  rating: ratingMap[manga.attributes.contentRating] ?? "safe",
  format: formatMap[manga.attributes.lastVolume ? "manga" : manga.attributes.type] ?? "manga",
  origin: "original",
  tags,
  authors: creators("author"),
  artists: creators("artist"),
  cover: cover ? { kind: "image", src: `/manga/${seriesSlug}/cover.jpg`, alt: `${title} cover` } : undefined,
  art: [],
  featured: false,
  updatedAt: date,
})}\n---\n\nImported from MangaDex: ${input}\n`);

if (cover) {
  const response = await fetch(`https://uploads.mangadex.org/covers/${mangaId}/${cover}`, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`MangaDex cover server returned HTTP ${response.status}.`);
  await Bun.write(`${MANGA_MEDIA_ROOT}/${seriesSlug}/cover.jpg`, await response.arrayBuffer());
}

for (const [index, item] of chapterRows.entries()) {
  const pagePath = `/manga/${seriesSlug}/${item.path}`;
  const outputPath = `${MANGA_MEDIA_ROOT}/${seriesSlug}/${item.path}`;
  await Bun.$`mkdir -p ${outputPath}`;
  await Bun.write(`${CHAPTER_DIR}/${item.path}.md`, `---\n${yaml({
    slug: item.path,
    series: seriesSlug,
    number: Number(item.data.attributes.chapter ?? index + 1),
    title: item.data.attributes.title || `Chapter ${item.data.attributes.chapter ?? index + 1}`,
    publishedAt: item.data.attributes.publishAt?.slice(0, 10),
    pagePath,
    pageExtension: "jpg",
    pageCount: item.pages.length,
    pageWidth: 1,
    pageHeight: 1,
    readingDirection: "rtl",
    status: "published",
  })}\n---\n\n${item.data.attributes.externalUrl ? `Source: ${item.data.attributes.externalUrl}` : "Imported from MangaDex."}\n`);
  for (const [page, filename] of item.pages.entries()) {
    const response = await fetch(`https://uploads.mangadex.org/data/${item.hash}/${filename}`, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`MangaDex image server returned HTTP ${response.status} for ${filename}.`);
    await Bun.write(`${outputPath}/${String(page + 1).padStart(3, "0")}.jpg`, await response.arrayBuffer());
  }
  console.log(`[${index + 1}/${chapterRows.length}] ${item.path}`);
}
