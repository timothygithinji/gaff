import { createAuthClient } from "better-auth/react";

/**
 * Browser-side Better Auth client. Calls back to the auth handler mounted
 * by `createAuth(env)` on the server. Same-origin by default — when the
 * server-side handler lives elsewhere, pass `baseURL` explicitly:
 *
 *   export const authClient = createAuthClient({ baseURL: "https://api.example.com" });
 *
 * Usage:
 *
 *   import { authClient } from "./lib/auth-client";
 *   const { data: session } = authClient.useSession();
 *   await authClient.signIn.email({ email, password });
 */
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
