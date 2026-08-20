export const ARCHIVE_PAGE_SIZE = 24;

export function getArchivePageHref(basePath: string, page: number): string {
  return page === 1 ? basePath : `${basePath}/page/${page}`;
}
