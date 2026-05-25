/**
 * Resolve a listing photo row to a browser-loadable URL.
 *
 * Cached photos live in R2 and are served by the Worker at
 * `/clusters/{cluster}/listings/{listing}/{file}` (see the `PHOTO_PATH_RE`
 * branch in `src/server.ts`). The key is stored WITHOUT a leading slash, so
 * we add one to make the URL root-absolute. Without it the browser resolves
 * the path relative to the current page — fine at `/`, but on a deeper route
 * like `/listings/$clusterId` it becomes `/listings/clusters/…` and 404s
 * (and never matches the photo route, so the portal fallback can't fire).
 *
 * Uncached photos (`r2Key` null) fall back to the original portal URL, which
 * is already absolute (`https://…`).
 */
export function resolvePhotoUrl(photo: {
  r2Key: string | null;
  url: string;
}): string {
  return photo.r2Key ? `/${photo.r2Key}` : photo.url;
}
