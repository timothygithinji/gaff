/**
 * Perceptual image hashing (dHash) — the cross-portal identity signal.
 *
 * dHash is the difference hash: shrink the image to 9×8 greyscale, then for
 * each of the 8 rows compare the 8 adjacent horizontal pixel pairs, emitting
 * one bit per comparison (left brighter than right → 1). 64 bits total.
 *
 * It encodes the gradient STRUCTURE of the image, not its exact pixels, so it
 * survives the resize, recompression and mild colour shift a portal applies
 * when it rehosts the same photo under its own CDN. Two rehosts of one image
 * land within a small Hamming distance; unrelated images don't. That's what
 * lets `phashesMatch` recognise the same flat across Zoopla and Rightmove,
 * where the content-key (CDN basename) signal can't.
 *
 * Returns the unsigned 64-bit hash as a decimal string (how it's stored in
 * `listing_photos.phash`), or null when the bytes can't be decoded (animated
 * GIF, SVG, truncated download) — callers treat null as "no signal".
 *
 * Node-only: pulls in `sharp`. Keep this out of pure/browser modules; the
 * matching helpers in `photo-identity.ts` stay sharp-free.
 */
import sharp from "sharp";

export async function perceptualHash(
  bytes: Buffer | ArrayBuffer | Uint8Array
): Promise<string | null> {
  try {
    const input = Buffer.isBuffer(bytes)
      ? bytes
      : Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes);
    const { data } = await sharp(input)
      .greyscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    // 9 columns × 8 rows = 72 greyscale samples.
    if (data.length < 72) {
      return null;
    }
    let hash = 0n;
    let bit = 0n;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const left = data[row * 9 + col] as number;
        const right = data[row * 9 + col + 1] as number;
        if (left > right) {
          hash |= 1n << bit;
        }
        bit++;
      }
    }
    return hash.toString();
  } catch {
    return null;
  }
}
