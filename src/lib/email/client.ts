/**
 * Resend client accessor.
 *
 * `RESEND_API_KEY` is optional in the env schema (see `src/lib/env.ts`) so
 * env() never throws on a worker that hasn't been staged with it. We
 * enforce its presence HERE, at the one place that actually sends, with a
 * clear error — so a missing key fails the email task loudly rather than
 * silently dropping a notification.
 */
import { Resend } from "resend";
import { env } from "../env";

export function getResend(): Resend {
  const key = env().RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set — add it to the Doppler config so notification emails can send"
    );
  }
  return new Resend(key);
}
