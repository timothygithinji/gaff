import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "../../db";
import { cloudflareAccess } from "./auth/cloudflare-access";

/**
 * Server-side Better Auth factory. Constructs an instance per request so
 * it can pick up the Worker's bindings — Neon's serverless driver needs
 * a connection string at call time, so the underlying Drizzle handle
 * isn't safe to create at module load.
 *
 * Wire this into your route handler:
 *
 *   const auth = createAuth(c.env);
 *   const session = await auth.api.getSession({ headers: req.headers });
 */
export function createAuth(env: {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string;
  CLOUDFLARE_ACCESS_AUD: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: string;
  KV?: KVNamespace;
}) {
  return betterAuth({
    database: drizzleAdapter(getDb(env), { provider: "pg" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
    },
    plugins: [
      cloudflareAccess({
        teamDomain: env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
        audience: env.CLOUDFLARE_ACCESS_AUD,
        kv: env.KV,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
