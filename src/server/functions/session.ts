/**
 * Session helpers shared by server functions.
 *
 * `getCurrentUser()` resolves the request to a minimal user shape
 * (`userId`, `email`), or `null` when there's no session — callers throw
 * `unauthorized` if they need one. It first reads the Better Auth session
 * cookie; failing that, it trades a Cloudflare Access JWT for a fresh
 * session (see below), so a user already authenticated by CF Access is
 * signed in transparently and never sees the login form.
 *
 * The Cloudflare bindings come from `cloudflare:workers` (populated at
 * request time by the Vite plugin's miniflare), so this can't be
 * called outside the Worker request scope.
 */
import { env } from "cloudflare:workers";
import { getRequest, getResponseHeaders } from "@tanstack/react-start/server";
import { createAuth } from "../../lib/auth";
import { hasCloudflareAccessToken } from "../../lib/auth/cloudflare-access";
import type { Env } from "../../server";

export type CurrentUser = {
  userId: string;
  email: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const request = getRequest();
  const auth = createAuth(env as unknown as Env);

  const session = await auth.api.getSession({ headers: request.headers });
  if (session) {
    return {
      userId: session.user.id,
      email: session.user.email,
    };
  }

  // No Better Auth session cookie. When the request still carries a
  // Cloudflare Access JWT — CF injects it on every request once the user
  // clears the Access policy — trade it for a Better Auth session so the
  // sign-in is automatic. Any failure (expired/invalid JWT, upsert error)
  // falls through to `null` and the normal login flow takes over.
  if (!hasCloudflareAccessToken(request.headers)) {
    return null;
  }

  try {
    const { headers, response } = await auth.api.cloudflareAccessSession({
      headers: request.headers,
      returnHeaders: true,
    });

    // Forward the freshly-minted session cookie onto the SSR / server-fn
    // response so the browser holds it for every subsequent request and
    // `getSession` short-circuits above next time.
    const resHeaders = getResponseHeaders();
    for (const cookie of headers.getSetCookie()) {
      resHeaders.append("set-cookie", cookie);
    }

    return {
      userId: response.user.id,
      email: response.user.email,
    };
  } catch {
    return null;
  }
}
