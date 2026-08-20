export type MangaRating = "safe" | "suggestive" | "explicit";

export const isVisibleWithSfwFilter = (rating: MangaRating, sfwEnabled: boolean) => !sfwEnabled || rating !== "explicit";

export const shouldRequireContentWarning = (rating: MangaRating, sfwEnabled: boolean, routeConfirmed: boolean) =>
  rating === "explicit" && sfwEnabled && !routeConfirmed;
