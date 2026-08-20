export type HomepageSelectionInput = {
  focusSlug: string;
  constellationSlugs: string[];
};

export type HomepageSelectionConfig = HomepageSelectionInput & {
  visualArtifactSlugs: string[];
  mangaSlugs: string[];
};

export const homepageConfig: HomepageSelectionConfig = {
  focusSlug: "vermis-the-game-that-never-was",
  constellationSlugs: [
    "aryamehr-f14-and-iiaf",
    "the-shahs-war-in-dhofar",
    "ace-combat-3-electrosphere",
  ],
  visualArtifactSlugs: [
    "shirow-masamune-artworks-in-the-shell",
    "the-ghost-in-the-shell-2026",
    "strawberry-panic-old-yuri",
    "the-starry-night-1889",
  ],
  mangaSlugs: [
    "tenmaku-no-jaadugar",
    "ghost-in-the-shell",
    "murcielago",
    "witches-and-cigarettes",
  ],
};

export function getHomepageSelections<T extends { data: { slug: string } }>(
  entries: T[],
  config: HomepageSelectionInput = homepageConfig,
) {
  const entriesBySlug = new Map(entries.map((entry) => [entry.data.slug, entry]));
  const focus = entriesBySlug.get(config.focusSlug);
  const seen = new Set(focus ? [focus.data.slug] : []);
  const constellation = config.constellationSlugs.flatMap((slug) => {
    const entry = entriesBySlug.get(slug);
    if (!entry || seen.has(slug)) return [];

    seen.add(slug);
    return [entry];
  });

  return { focus, constellation };
}
