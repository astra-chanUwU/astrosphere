export const siteConfig = {
  archiveName: "AstroSphere",
  name: "Astro Chan UwU",
  description: "Astro Chan's personal collection of manga, games, images, essays, research, and strange little experiments.",
  siteUrl: "https://astrosphere.example",
  socialImage: "/social-preview.png",
  workEmail: "your-email@example.com",
} as const;

export const hasConfiguredWorkEmail =
  siteConfig.workEmail.length > 0 && !siteConfig.workEmail.endsWith("@example.com");
