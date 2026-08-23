type ImageSetArtist = { name: string; slug: string };

const slugify = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const getImageSetArtists = (author: string | undefined, credits: string[]): ImageSetArtist[] => {
  const artists = new Map<string, ImageSetArtist>();
  if (author?.trim()) {
    const slug = slugify(author);
    artists.set(slug, { name: author.trim(), slug });
  }
  for (const credit of credits) {
    const match = credit.match(/^Artist:\s*(.+)$/i);
    if (!match) continue;
    const name = match[1].trim();
    const slug = slugify(name);
    if (slug) artists.set(slug, { name, slug });
  }
  return [...artists.values()];
};
