/**
 * Request a display-sized variant of a listing photo.
 *
 * Photos are cached to R2 at the largest size each portal serves (see
 * `cache-photos.ts` + the Zoopla `1024/768` base) and served by the Worker at
 * `/clusters/{cluster}/listings/{listing}/{file}`. Stretching that single
 * source across a full-width desktop hero upscaled it and looked pixelated.
 *
 * The Worker resizes on the fly when a `?w=` param is present (Cloudflare
 * image transform via `cf.image`, see `src/server.ts`), so callers ask for
 * roughly the width they'll render at and the edge hands back a right-sized,
 * format-negotiated (webp/avif) variant. Resizing uses `fit: scale-down`, so
 * over-asking never upscales — a small original is served as-is.
 *
 * Only our own R2-served paths (`/clusters/…`) are rewritten; external portal
 * fallback URLs (`https://…`) and empty values pass through untouched, since
 * Cloudflare only resizes same-zone sources.
 *
 * `width` is the CSS render width; pass the largest the element reaches (the
 * helper bumps for retina internally). Omit sizing for full-screen lightboxes
 * where the original max-res is wanted.
 */
const LOCAL_PHOTO_RE = /^\/clusters\//;

/** Cap requests so a stray large value can't ask the edge for an absurd size. */
const MAX_REQUEST_WIDTH = 2048;

export function sizedPhoto(url: string, width: number): string {
  if (!(url && LOCAL_PHOTO_RE.test(url))) {
    return url;
  }
  // 2× for high-DPR screens; `scale-down` keeps it from upscaling past source.
  const w = Math.min(Math.round(width * 2), MAX_REQUEST_WIDTH);
  return `${url}?w=${w}`;
}
