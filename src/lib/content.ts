import { getCollection, type CollectionEntry } from "astro:content";

import type { TrailItem } from "../types/content";
import { validateMangaReferences } from "./manga-references";
import { sortMangaChapters } from "./manga-reader";
import {
  collectPublishingAssetReferences,
  collectPublishingUrlReferences,
  validatePublishedTarget,
  validatePublishingAssetReferences,
  validatePublishingUrlReferences,
  type PublishingIssue,
} from "./publishing-guard";

type ArtifactEntry = CollectionEntry<"artifacts">;
type SphereEntry = CollectionEntry<"spheres">;
type TrailEntry = CollectionEntry<"trails">;
type PageEntry = CollectionEntry<"pages">;
export type MangaSeriesEntry = CollectionEntry<"mangaSeries">;
export type MangaChapterEntry = CollectionEntry<"mangaChapters">;
export type SignalEntry = CollectionEntry<"signals">;
export type ImageSetEntry = CollectionEntry<"imageSets">;

type ReferenceEntry = ArtifactEntry | SphereEntry | TrailEntry;

export type ContentReferenceIssue = {
  source: string;
  field: string;
  target: string;
  expectedCollection: "artifacts" | "spheres" | "signals" | "mangaSeries";
};

export type TrailItemTarget = {
  item: TrailItem;
  entry: ArtifactEntry | SphereEntry | SignalEntry;
  href: string;
  external: boolean;
};

export type TrailProgress = {
  trail: TrailEntry;
  targets: TrailItemTarget[];
  currentIndex: number;
};

const isPublished = <T extends { data: { status: string } }>(entry: T) =>
  entry.data.status === "published";

const bySlug = <T extends { data: { slug: string } }>(entries: T[]) =>
  new Map(entries.map((entry) => [entry.data.slug, entry]));

export async function getPublishedArtifacts(): Promise<ArtifactEntry[]> {
  return (await getCollection("artifacts", isPublished)).sort(
    (left, right) =>
      right.data.publishedAt.getTime() - left.data.publishedAt.getTime(),
  );
}

export async function getPublishedSpheres(): Promise<SphereEntry[]> {
  return (await getCollection("spheres", isPublished)).sort(
    (left, right) =>
      left.data.order - right.data.order ||
      left.data.title.localeCompare(right.data.title),
  );
}

export async function getPublishedTrails(): Promise<TrailEntry[]> {
  return (await getCollection("trails", isPublished)).sort((left, right) =>
    left.data.title.localeCompare(right.data.title),
  );
}

export async function getPublishedPages(): Promise<PageEntry[]> {
  return (await getCollection("pages", isPublished)).sort((left, right) =>
    left.data.title.localeCompare(right.data.title),
  );
}

export async function getPublishedMangaSeries(): Promise<MangaSeriesEntry[]> {
  return (
    await getCollection(
      "mangaSeries",
      (series) => series.data.visibility === "published",
    )
  ).sort((left, right) => left.data.title.localeCompare(right.data.title));
}

export async function getPublishedMangaChapters(): Promise<
  MangaChapterEntry[]
> {
  return sortMangaChapters(await getCollection("mangaChapters", isPublished));
}

export async function getPublishedSignals(): Promise<SignalEntry[]> {
  return (await getCollection("signals", isPublished)).sort(
    (left, right) =>
      right.data.visitedAt.getTime() - left.data.visitedAt.getTime(),
  );
}

export async function getPublishedImageSets(): Promise<ImageSetEntry[]> {
  return (await getCollection("imageSets", isPublished)).sort(
    (left, right) =>
      right.data.publishedAt.getTime() - left.data.publishedAt.getTime(),
  );
}

export async function getImageSetBySlug(
  slug: string,
): Promise<ImageSetEntry | undefined> {
  return (await getPublishedImageSets()).find(
    (entry) => entry.data.slug === slug,
  );
}

export async function getPublishedTags(): Promise<string[]> {
  const [artifacts, manga, signals, imageSets] = await Promise.all([
    getPublishedArtifacts(),
    getPublishedMangaSeries(),
    getPublishedSignals(),
    getPublishedImageSets(),
  ]);

  return [
    ...new Set(
      [...artifacts, ...manga, ...signals, ...imageSets].flatMap(
        (entry) => entry.data.tags,
      ),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

export async function getContentForTag(tag: string): Promise<{
  artifacts: ArtifactEntry[];
  manga: MangaSeriesEntry[];
  signals: SignalEntry[];
  imageSets: ImageSetEntry[];
}> {
  const [artifacts, manga, signals, imageSets] = await Promise.all([
    getPublishedArtifacts(),
    getPublishedMangaSeries(),
    getPublishedSignals(),
    getPublishedImageSets(),
  ]);

  return {
    artifacts: artifacts.filter((artifact) => artifact.data.tags.includes(tag)),
    manga: manga.filter((series) => series.data.tags.includes(tag)),
    signals: signals.filter((signal) => signal.data.tags.includes(tag)),
    imageSets: imageSets.filter((imageSet) => imageSet.data.tags.includes(tag)),
  };
}

export async function getMangaChaptersForSeries(
  seriesSlug: string,
): Promise<MangaChapterEntry[]> {
  return (await getPublishedMangaChapters()).filter(
    (chapter) => chapter.data.series === seriesSlug,
  );
}

export async function getArtifactsForSphere(
  sphereSlug: string,
): Promise<ArtifactEntry[]> {
  return (await getPublishedArtifacts()).filter((artifact) =>
    artifact.data.spheres.includes(sphereSlug),
  );
}

export async function getSignalsForSphere(
  sphereSlug: string,
): Promise<SignalEntry[]> {
  return (await getPublishedSignals()).filter((signal) =>
    signal.data.spheres.includes(sphereSlug),
  );
}

export async function getSignalsForArtifact(
  artifact: ArtifactEntry,
): Promise<SignalEntry[]> {
  const artifactTags = new Set(artifact.data.tags);
  return (await getPublishedSignals()).filter((signal) =>
    signal.data.tags.some((tag) => artifactTags.has(tag)),
  );
}

export async function getTrailsForArtifact(
  artifactSlug: string,
): Promise<TrailEntry[]> {
  return (await getPublishedTrails()).filter((trail) =>
    trail.data.items.some(
      (item) => item.kind === "artifact" && item.slug === artifactSlug,
    ),
  );
}

export async function getTrailProgressForArtifact(
  artifactSlug: string,
): Promise<TrailProgress[]> {
  const trails = await getTrailsForArtifact(artifactSlug);
  const progress = await Promise.all(
    trails.map(async (trail) => {
      const targets = await getTrailItemTargets(trail);
      const currentIndex = targets.findIndex(
        (target) =>
          target.entry.collection === "artifacts" &&
          target.entry.data.slug === artifactSlug,
      );
      return currentIndex >= 0 ? { trail, targets, currentIndex } : undefined;
    }),
  );

  return progress.filter(
    (value): value is TrailProgress => value !== undefined,
  );
}

export async function getRelatedArtifacts(
  artifact: ArtifactEntry,
): Promise<ArtifactEntry[]> {
  const artifacts = bySlug(await getPublishedArtifacts());

  return artifact.data.related.flatMap((slug) => {
    const related = artifacts.get(slug);
    return related ? [related] : [];
  });
}

export async function getTrailItemTargets(
  trail: TrailEntry,
): Promise<TrailItemTarget[]> {
  const [artifacts, spheres, signals] = await Promise.all([
    getPublishedArtifacts(),
    getPublishedSpheres(),
    getPublishedSignals(),
  ]);
  const artifactsBySlug = bySlug(artifacts);
  const spheresBySlug = bySlug(spheres);
  const signalsBySlug = bySlug(signals);

  return trail.data.items.reduce<TrailItemTarget[]>((targets, item) => {
    if (item.kind === "artifact") {
      const entry = artifactsBySlug.get(item.slug);
      if (entry)
        targets.push({
          item,
          entry,
          href: `/artifacts/${entry.data.slug}`,
          external: false,
        });
      return targets;
    }
    if (item.kind === "sphere") {
      const entry = spheresBySlug.get(item.slug);
      if (entry)
        targets.push({
          item,
          entry,
          href: `/spheres/${entry.data.slug}`,
          external: false,
        });
      return targets;
    }
    const entry = signalsBySlug.get(item.slug);
    if (entry)
      targets.push({ item, entry, href: entry.data.url, external: true });
    return targets;
  }, []);
}

export async function getFeaturedArtifacts(): Promise<ArtifactEntry[]> {
  return (await getPublishedArtifacts()).filter(
    (artifact) => artifact.data.featured,
  );
}

export async function getRecentArtifacts(limit = 3): Promise<ArtifactEntry[]> {
  return (await getPublishedArtifacts()).slice(0, Math.max(0, limit));
}

export async function getRandomArtifact(): Promise<ArtifactEntry | undefined> {
  const artifacts = await getPublishedArtifacts();
  return artifacts.length > 0
    ? artifacts[Math.floor(Math.random() * artifacts.length)]
    : undefined;
}

export function validateContentReferences({
  artifacts,
  spheres,
  trails,
  signals,
}: {
  artifacts: ArtifactEntry[];
  spheres: SphereEntry[];
  trails: TrailEntry[];
  signals: SignalEntry[];
}): ContentReferenceIssue[] {
  const artifactSlugs = new Set(
    artifacts.map((artifact) => artifact.data.slug),
  );
  const sphereSlugs = new Set(spheres.map((sphere) => sphere.data.slug));
  const signalSlugs = new Set(signals.map((signal) => signal.data.slug));
  const issues: ContentReferenceIssue[] = [];

  const requireTarget = (
    source: ReferenceEntry,
    field: string,
    target: string,
    expectedCollection: "artifacts" | "spheres" | "signals",
  ) => {
    const targets =
      expectedCollection === "artifacts"
        ? artifactSlugs
        : expectedCollection === "spheres"
          ? sphereSlugs
          : signalSlugs;
    if (!targets.has(target)) {
      issues.push({
        source: `${source.collection}:${source.data.slug}`,
        field,
        target,
        expectedCollection,
      });
    }
  };

  for (const artifact of artifacts) {
    for (const sphere of artifact.data.spheres) {
      requireTarget(artifact, "spheres", sphere, "spheres");
    }
    for (const related of artifact.data.related) {
      requireTarget(artifact, "related", related, "artifacts");
    }
  }

  for (const sphere of spheres) {
    if (sphere.data.parent)
      requireTarget(sphere, "parent", sphere.data.parent, "spheres");
  }

  for (const trail of trails) {
    for (const sphere of trail.data.spheres) {
      requireTarget(trail, "spheres", sphere, "spheres");
    }
    for (const item of trail.data.items) {
      requireTarget(
        trail,
        `items[${item.kind}]`,
        item.slug,
        item.kind === "artifact"
          ? "artifacts"
          : item.kind === "sphere"
            ? "spheres"
            : "signals",
      );
    }
  }

  return issues;
}

export async function assertPublishingGuardrails(): Promise<void> {
  const [
    artifacts,
    spheres,
    trails,
    pages,
    mangaSeries,
    mangaChapters,
    signals,
    imageSets,
  ] = await Promise.all([
    getCollection("artifacts"),
    getCollection("spheres"),
    getCollection("trails"),
    getCollection("pages"),
    getCollection("mangaSeries"),
    getCollection("mangaChapters"),
    getCollection("signals"),
    getCollection("imageSets"),
  ]);
  const allEntries = [
    ...artifacts,
    ...spheres,
    ...trails,
    ...pages,
    ...mangaSeries,
    ...mangaChapters,
    ...signals,
    ...imageSets,
  ];
  const publishedEntries = allEntries.filter((entry) =>
    entry.collection === "mangaSeries"
      ? entry.data.visibility === "published"
      : entry.data.status === "published",
  );
  const referenceIssues = [
    ...validateContentReferences({
      artifacts: artifacts.filter(isPublished),
      spheres: spheres.filter(isPublished),
      trails: trails.filter(isPublished),
      signals: signals.filter(isPublished),
    }),
    ...validateMangaReferences({
      mangaSeries,
      mangaChapters: mangaChapters.filter(isPublished),
    }),
  ];
  const assetIssues = await validatePublishingAssetReferences(
    collectPublishingAssetReferences(publishedEntries),
  );
  const urlIssues = publishedEntries.flatMap((entry) =>
    validatePublishingUrlReferences(
      collectPublishingUrlReferences(
        entry.body ?? "",
        `${entry.collection}:${entry.data.slug}`,
      ),
    ),
  );
  const publishedIssues: PublishingIssue[] = [];
  const mangaSeriesBySlug = new Map(
    mangaSeries.map((entry) => [entry.data.slug, entry]),
  );
  const requirePublished = (
    source: string,
    field: string,
    target: string,
    entry: { data: { status: "draft" | "published" | "archived" } } | undefined,
  ) => {
    if (!entry) return;
    const issue = validatePublishedTarget({
      source,
      field,
      target,
      targetStatus: entry.data.status,
    });
    if (issue) publishedIssues.push(issue);
  };

  for (const artifact of artifacts.filter(isPublished)) {
    const source = `${artifact.collection}:${artifact.data.slug}`;
    artifact.data.spheres.forEach((slug) =>
      requirePublished(
        source,
        "spheres",
        slug,
        spheres.find((entry) => entry.data.slug === slug),
      ),
    );
    artifact.data.related.forEach((slug) =>
      requirePublished(
        source,
        "related",
        slug,
        artifacts.find((entry) => entry.data.slug === slug),
      ),
    );
  }
  for (const sphere of spheres.filter(isPublished)) {
    if (sphere.data.parent)
      requirePublished(
        `${sphere.collection}:${sphere.data.slug}`,
        "parent",
        sphere.data.parent,
        spheres.find((entry) => entry.data.slug === sphere.data.parent),
      );
  }
  for (const trail of trails.filter(isPublished)) {
    const source = `${trail.collection}:${trail.data.slug}`;
    trail.data.spheres.forEach((slug) =>
      requirePublished(
        source,
        "spheres",
        slug,
        spheres.find((entry) => entry.data.slug === slug),
      ),
    );
    trail.data.items.forEach((item) =>
      requirePublished(
        source,
        `items[${item.kind}]`,
        item.slug,
        item.kind === "artifact"
          ? artifacts.find((entry) => entry.data.slug === item.slug)
          : item.kind === "sphere"
            ? spheres.find((entry) => entry.data.slug === item.slug)
            : signals.find((entry) => entry.data.slug === item.slug),
      ),
    );
  }
  for (const chapter of mangaChapters.filter(isPublished)) {
    const series = mangaSeriesBySlug.get(chapter.data.series);
    if (!series) continue;
    const issue = validatePublishedTarget({
      source: `${chapter.collection}:${chapter.data.slug}`,
      field: "series",
      target: chapter.data.series,
      targetStatus:
        series.data.visibility === "published" ? "published" : "draft",
    });
    if (issue) publishedIssues.push(issue);
  }

  if (
    referenceIssues.length > 0 ||
    assetIssues.length > 0 ||
    urlIssues.length > 0 ||
    publishedIssues.length > 0
  ) {
    const details = [
      ...referenceIssues.map(
        (issue) =>
          `- ${issue.source}.${issue.field} references missing ${issue.expectedCollection} slug "${issue.target}".`,
      ),
      ...[...assetIssues, ...urlIssues, ...publishedIssues].map(
        (issue) => `- ${issue.source}.${issue.field}: ${issue.message}.`,
      ),
    ].join("\n");
    throw new Error(`Publishing guard failed:\n${details}`);
  }
}

export const assertContentReferences = assertPublishingGuardrails;
