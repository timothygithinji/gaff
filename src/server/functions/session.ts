/**
 * Session helpers shared by server functions.
 *
 * `getCurrentUser()` reads the Better Auth session cookie off the
 * incoming request and resolves to a minimal user shape (`userId`,
 * `email`). Returns `null` when there's no session — callers throw
 * `unauthorized` if they need one.
 *
 * The Cloudflare bindings come from `cloudflare:workers` (populated at
 * request time by the Vite plugin's miniflare), so this can't be
 * called outside the Worker request scope.
 */
import { env } from "cloudflare:workers";
import { getRequest } from "@tanstack/react-start/server";
import { createAuth } from "../../lib/auth";
import type { Env } from "../../server";

export type CurrentUser = {
  userId: string;
  email: string;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const request = getRequest();
  const auth = createAuth(env as unknown as Env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }

  return {
    userId: session.user.id,
    email: session.user.email,
  };
}
