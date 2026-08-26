export type AnimePresentationVideo = {
  data: {
    slug: string;
    kind: "episode" | "movie" | "extra";
    number?: number;
    variants: unknown[];
  };
};

export const getAnimeTitlePresentation = (
  kind: "series" | "movie",
  slug: string,
  videos: AnimePresentationVideo[],
) => {
  const episodeVideos = videos.filter((video) => video.data.kind === "episode");
  const firstVideo = episodeVideos[0] ?? videos[0];
  const variantCount = videos.reduce((count, video) => count + video.data.variants.length, 0);
  const itemCount = kind === "movie" ? videos.length : episodeVideos.length;
  const itemName = kind === "movie" ? "compilation" : "episode";

  return {
    startHref: kind === "movie" ? `/anime/${slug}#watch` : firstVideo ? `/anime/${slug}/${firstVideo.data.slug}` : `/anime/${slug}`,
    startLabel: kind === "movie" ? "Watch compilation" : firstVideo?.data.number ? `Start episode ${firstVideo.data.number}` : "Browse episodes",
    itemCountLabel: `${itemCount} ${itemName}${itemCount === 1 ? "" : "s"}`,
    variantCountLabel: `${variantCount} WebM${variantCount === 1 ? "" : "s"}`,
  };
};
