/**
 * Request a display-sized variant of a listing photo.
 *
 * Photos are cached to R2 at the largest size each portal serves (see
 * `cache-photos.ts` + the Zoopla `1600/1200` base) and served by the Worker at
 * `/clusters/{cluster}/listings/{listing}/{file}`. Stretching that single
 * source across a full-width desktop hero upscaled it and looked pixelated.
 *
 * Rather than transform on the fly (Cloudflare's `cf.image` Image
 * Transformations bill per unique transform and capped us out of the free
 * 5,000/month in a single browse), `cache-photos` PRE-GENERATES a fixed ladder
 * of widths and stores each beside the original in R2 — keyed
 * `{file%ext}_w{bucket}{ext}` (see `variantKey`). `sizedPhoto` appends
 * `?w={bucket}` for the width a component renders at; the Worker
 * (`src/server.ts`) maps that to the nearest bucket and serves the static,
 * right-sized object straight from R2. No transforms, so it stays free.
 *
 * Over-asking never upscales: buckets at or above the source width are never
 * generated, and the Worker falls back to the full-size original for them —
 * the same "scale-down" guarantee the old transform gave.
 *
 * Only our own R2-served paths (`/clusters/…`) are rewritten; external portal
 * fallback URLs (`https://…`) and empty values pass through untouched.
 *
 * `width` is the CSS render width; pass the largest the element reaches (the
 * helper bumps for retina internally). Omit sizing for full-screen lightboxes
 * where the original max-res is wanted.
 */
const LOCAL_PHOTO_RE = /^\/clusters\//;

/**
 * The fixed ladder of pixel widths we pre-generate and serve. Chosen to cover
 * the render widths the UI actually asks for after the 2× retina bump:
 * thumbnails (≤256), gallery/hero columns (768), desktop heroes (1536) and
 * full-width / lightbox-adjacent (2048). A requested width rounds UP to the
 * nearest bucket (`bucketForWidth`), so a width between rungs just gets the
 * next-sharper variant. Keep this in step with the generator in
 * `cache-photos.ts` (it imports this list).
 */
export const PHOTO_WIDTH_BUCKETS = [256, 768, 1536, 2048] as const;

/**
 * Smallest bucket ≥ `width`, or the largest bucket when `width` exceeds the
 * ladder. Used by both `sizedPhoto` (to label the request) and the Worker (to
 * resolve the request to a stored object), so the two never disagree on which
 * variant a width maps to.
 */
export function bucketForWidth(width: number): number {
  let largest: number = PHOTO_WIDTH_BUCKETS[0];
  for (const b of PHOTO_WIDTH_BUCKETS) {
    if (b >= width) {
      return b;
    }
    largest = b;
  }
  return largest;
}

/**
 * Insert `_w{bucket}` before the file extension of an R2 key or photo path:
 *   clusters/…/3-ab12cd34.jpg → clusters/…/3-ab12cd34_w768.jpg
 * Keys without an extension (shouldn't happen for photos) just get the suffix
 * appended. Shared by the generator and the Worker so the key shape is defined
 * in exactly one place.
 */
export function variantKey(key: string, bucket: number): string {
  const dot = key.lastIndexOf(".");
  if (dot === -1) {
    return `${key}_w${bucket}`;
  }
  return `${key.slice(0, dot)}_w${bucket}${key.slice(dot)}`;
}

export function sizedPhoto(url: string, width: number): string {
  if (!(url && LOCAL_PHOTO_RE.test(url))) {
    return url;
  }
  // 2× for high-DPR screens, then snap to a generated bucket so every caller
  // asking for the same rung shares one cache URL (and a stored object).
  const bucket = bucketForWidth(Math.round(width * 2));
  return `${url}?w=${bucket}`;
}
