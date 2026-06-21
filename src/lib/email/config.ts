/**
 * Shared email configuration.
 *
 * The sender must be a Resend-verified address — set `EMAIL_FROM` to it
 * (e.g. `Gaff <gaff@updates.your-domain.com>`). Links point at the canonical
 * app origin (`BETTER_AUTH_URL`) so an email opened on a phone deep-links
 * straight into the right surface.
 */
import { resolvePhotoUrl } from "../../server/functions/photo-url";
import { env } from "../env";
import { sizedPhoto } from "../photo-size";

/**
 * Verified Resend sender (display name + address). Prefers the configured
 * `EMAIL_FROM`; otherwise falls back to a no-reply on the app's own host so
 * a fresh deploy still has a usable default (point a verified sender at it).
 */
export function fromEmail(): string {
  const configured = env().EMAIL_FROM;
  if (configured) {
    return configured;
  }
  const host = new URL(env().BETTER_AUTH_URL).host;
  return `Gaff <gaff@${host}>`;
}

const TRAILING_SLASH_RE = /\/+$/;

/** Canonical app origin, no trailing slash — for building email links. */
export function appUrl(): string {
  return env().BETTER_AUTH_URL.replace(TRAILING_SLASH_RE, "");
}

/**
 * Absolute, display-sized `src` for a listing photo in an email.
 *
 * Prefers our own R2-served photo: `resolvePhotoUrl` yields the root-relative
 * `/clusters/…` path, `sizedPhoto` snaps it to the nearest pre-generated width
 * bucket (`?w=…`), and we prefix the app origin so a mail client — which has no
 * page base and no Access session — can fetch it directly. The `/clusters/*`
 * photo path is exempted from Cloudflare Access (a bypass app in
 * infra/cloudflare), so these load without a login.
 *
 * Uncached photos (`r2Key` null) resolve to the portal CDN URL, already
 * absolute and public, and pass through untouched.
 *
 * `width` is the CSS px the image renders at; the helper bumps for retina.
 */
export function emailPhotoUrl(
  photo: { r2Key: string | null; url: string },
  width: number
): string {
  const resolved = resolvePhotoUrl(photo);
  return resolved.startsWith("/")
    ? `${appUrl()}${sizedPhoto(resolved, width)}`
    : resolved;
}
