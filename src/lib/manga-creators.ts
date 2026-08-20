export type MangaCreatorRole = "author" | "artist";

type CreatorCredit = { name: string; slug: string };
type CreatorSeries = {
  data: {
    slug: string;
    title: string;
    visibility: string;
    authors: CreatorCredit[];
    artists: CreatorCredit[];
  };
};

export type MangaCreator = {
  slug: string;
  name: string;
  series: Array<{ slug: string; title: string; roles: MangaCreatorRole[] }>;
};

export function getMangaCreators(series: CreatorSeries[]): MangaCreator[] {
  const creators = new Map<string, MangaCreator>();

  for (const entry of series) {
    if (entry.data.visibility !== "published") continue;
    const roles = new Map<string, { name: string; roles: MangaCreatorRole[] }>();
    for (const person of entry.data.authors) roles.set(person.slug, { name: person.name, roles: ["author"] });
    for (const person of entry.data.artists) {
      const existing = roles.get(person.slug);
      if (existing) existing.roles.push("artist");
      else roles.set(person.slug, { name: person.name, roles: ["artist"] });
    }

    for (const [slug, person] of roles) {
      const creator = creators.get(slug) ?? { slug, name: person.name, series: [] };
      creator.series.push({ slug: entry.data.slug, title: entry.data.title, roles: person.roles });
      creators.set(slug, creator);
    }
  }

  return [...creators.values()].sort((left, right) => left.name.localeCompare(right.name));
}
