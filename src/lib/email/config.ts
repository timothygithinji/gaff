/**
 * Shared email configuration.
 *
 * Sender is on the Resend-verified `updates.example.com` domain.
 * Links point at the canonical app origin (`BETTER_AUTH_URL`) so an email
 * opened on a phone deep-links straight into the right surface.
 */
import { env } from "../env";

/** Verified Resend sender. Display name + address. */
export const FROM_EMAIL = "Gaff <gaff@updates.example.com>";

const TRAILING_SLASH_RE = /\/+$/;

/** Canonical app origin, no trailing slash — for building email links. */
export function appUrl(): string {
  return env().BETTER_AUTH_URL.replace(TRAILING_SLASH_RE, "");
}
