export type HomepageSelectionInput = {
  focusSlug: string;
  constellationSlugs: string[];
};

export type HomepageSelectionConfig = HomepageSelectionInput & {
  visualArtifactSlugs: string[];
  mangaSlugs: string[];
  shelfMangaSlugs: string[];
  shelfDoujinshiSlugs: string[];
  shelfImageSetSlugs: string[];
  artifactSlugs: string[];
  trailSlugs: string[];
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
  shelfMangaSlugs: [
    "ghost-in-the-shell",
    "murcielago",
    "gushing-over-magical-girls",
    "witches-and-cigarettes",
  ],
  shelfDoujinshiSlugs: ["a-hard-debut", "frill-no-shita-no-netsu"],
  shelfImageSetSlugs: ["flou-sona", "ndgd"],
  artifactSlugs: [
    "vermis-the-game-that-never-was",
    "the-ghost-in-the-shell-2026",
    "strawberry-panic-old-yuri",
  ],
  trailSlugs: ["cyberpunk-thread", "ghost-in-the-shell-orbit"],
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
