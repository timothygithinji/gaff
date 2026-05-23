import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nanoid } from "nanoid";
import { getDb } from "../../db";
import { householdMembers, households } from "../../db/schema";
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
 *
 * `databaseHooks.user.create.after` runs once per new user — covers both
 * the email/password sign-up path AND the Cloudflare Access plugin's
 * first-contact upsert (it goes through `internalAdapter.createUser`,
 * which routes through `createWithHooks`). The hook auto-creates a solo
 * household so freshly-signed-in users always have somewhere to land —
 * the `<HouseholdContext>` provider then has data on first paint.
 */
type AuthEnv = {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CLOUDFLARE_ACCESS_AUD: string;
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: string;
  KV?: KVNamespace;
};

export function createAuth(env: AuthEnv) {
  const db = getDb();

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Defensive: if this user already has a household
            // membership (e.g. accepted an invite before the hook
            // landed), skip auto-create. The unique index on
            // (household_id, user_id) would prevent dupes anyway, but
            // emitting an extra household + membership pair is
            // wasteful and confuses Settings.
            const existing = await db.query.householdMembers.findFirst({
              where: (hm, { eq }) => eq(hm.userId, user.id),
            });
            if (existing) {
              return;
            }

            const householdId = nanoid();
            await db.insert(households).values({
              id: householdId,
              name: "Your household",
            });
            await db.insert(householdMembers).values({
              id: nanoid(),
              householdId,
              userId: user.id,
              role: "owner",
            });
          },
        },
      },
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
