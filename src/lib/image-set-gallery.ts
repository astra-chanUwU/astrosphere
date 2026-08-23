import { getArchivePageHref } from "./archive";

export const IMAGE_SET_GALLERY_PAGE_SIZE = 24;

export function getImageSetGalleryPage<T>(items: T[], currentPage: number) {
  const lastPage = Math.max(1, Math.ceil(items.length / IMAGE_SET_GALLERY_PAGE_SIZE));
  const page = Math.min(Math.max(currentPage, 1), lastPage);
  const startIndex = (page - 1) * IMAGE_SET_GALLERY_PAGE_SIZE;
  const pageItems = items.slice(startIndex, startIndex + IMAGE_SET_GALLERY_PAGE_SIZE);

  return {
    items: pageItems,
    start: pageItems.length ? startIndex + 1 : 0,
    end: startIndex + pageItems.length,
    lastPage,
  };
}

export function getImageSetGalleryPageHref(slug: string, page: number): string {
  return getArchivePageHref(`/image-sets/${slug}`, page);
}
