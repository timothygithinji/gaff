import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { type JSONWebKeySet, createLocalJWKSet, jwtVerify } from "jose";

const CF_ACCESS_HEADER = "cf-access-jwt-assertion";
const CF_ACCESS_COOKIE = "CF_Authorization";
const JWKS_KV_KEY = "cf-access-jwks";
const JWKS_TTL_SECONDS = 60 * 60; // 1 hour

type CloudflareAccessOptions = {
  /**
   * Your Cloudflare Access team domain, e.g.
   *   https://timothygithinji.cloudflareaccess.com
   * No trailing slash. Pinned to the `iss` claim.
   */
  teamDomain: string;
  /**
   * The 64-char hex AUD tag from the Access Application. Pinned to the
   * `aud` claim. Multiple AUDs are accepted (e.g. when migrating apps).
   */
  audience: string | string[];
  /**
   * Worker KV binding used to cache the JWKS document under the key
   * `cf-access-jwks` with a 1h TTL.
   */
  kv?: KVNamespace;
  /**
   * Override the default endpoint mount path. Defaults to
   *   /cloudflare-access/session
   * which becomes `/api/auth/cloudflare-access/session` once Better Auth's
   * router mounts it.
   */
  endpoint?: string;
};

/**
 * Build the JWKS URL from the team domain. CF Access publishes JWKS at
 *   <teamDomain>/cdn-cgi/access/certs
 */
function jwksUrl(teamDomain: string): string {
  return new URL("/cdn-cgi/access/certs", teamDomain).toString();
}

/**
 * Fetch the JWKS document with a KV-backed cache. Falls back to a direct
 * fetch when no KV binding is configured. The cached payload is the raw
 * JWKS JSON which we then feed to `createLocalJWKSet` for verification —
 * `jose`'s `createRemoteJWKSet` does its own fetch which would bypass our
 * KV cache, so we stay on the local helper.
 */
async function getJwks(
  teamDomain: string,
  kv?: KVNamespace
): Promise<JSONWebKeySet> {
  if (kv) {
    const cached = await kv.get<JSONWebKeySet>(JWKS_KV_KEY, "json");
    // Trust the cache once the TTL has been honoured — an empty `keys`
    // array would be malformed upstream and is not worth re-fetching every
    // request until the TTL rolls.
    if (cached) {
      return cached;
    }
  }

  const res = await fetch(jwksUrl(teamDomain));
  if (!res.ok) {
    throw new Error(
      `Failed to fetch Cloudflare Access JWKS: ${res.status} ${res.statusText}`
    );
  }
  const jwks = (await res.json()) as JSONWebKeySet;

  if (kv) {
    await kv.put(JWKS_KV_KEY, JSON.stringify(jwks), {
      expirationTtl: JWKS_TTL_SECONDS,
    });
  }

  return jwks;
}

/**
 * Verify a CF Access JWT against the team's JWKS, pinning both `iss` and
 * `aud`. Returns the decoded payload on success; throws on any failure
 * (signature mismatch, wrong issuer/audience, expired, malformed).
 */
async function verifyAccessJwt(
  token: string,
  opts: {
    teamDomain: string;
    audience: string | string[];
    kv?: KVNamespace;
  }
) {
  const jwks = await getJwks(opts.teamDomain, opts.kv);
  const keystore = createLocalJWKSet(jwks);

  const { payload } = await jwtVerify(token, keystore, {
    issuer: opts.teamDomain,
    audience: opts.audience,
  });

  if (!payload.email || typeof payload.email !== "string") {
    throw new Error("Cloudflare Access JWT missing `email` claim");
  }

  return payload as typeof payload & { email: string };
}

/**
 * Find-or-create a Better Auth user keyed by the email claim from a
 * verified CF Access JWT. Returns the resulting user row; throws on
 * adapter failure.
 */
// biome-ignore lint/suspicious/noExplicitAny: better-auth's internal adapter doesn't surface a strong context type
async function upsertAccessUser(ctx: any, email: string, name: string) {
  let user = await ctx.context.internalAdapter
    .findUserByEmail(email)
    .then(
      (res: { user: { id: string; emailVerified: boolean } } | null) =>
        res?.user
    );

  if (!user) {
    try {
      user = await ctx.context.internalAdapter.createUser({
        email,
        emailVerified: true,
        name,
      });
    } catch (err) {
      // Two concurrent first-logins for the same email can both fall
      // through to createUser; the second hits the unique constraint on
      // user.email. Re-read on conflict and use the row the winner wrote.
      const found = await ctx.context.internalAdapter
        .findUserByEmail(email)
        .then(
          (res: { user: { id: string; emailVerified: boolean } } | null) =>
            res?.user
        );
      if (!found) {
        throw err;
      }
      user = found;
    }
    if (!user) {
      throw new APIError("INTERNAL_SERVER_ERROR", {
        message: "user_creation_failed",
      });
    }
    return user;
  }

  if (!user.emailVerified) {
    user = await ctx.context.internalAdapter.updateUser(user.id, {
      emailVerified: true,
    });
  }
  return user;
}

/**
 * Extract and verify the CF Access JWT from a request context. Returns
 * the decoded payload on success; throws `APIError` UNAUTHORIZED on any
 * failure (missing token, signature mismatch, wrong issuer/audience).
 */
async function authenticateRequest(
  // biome-ignore lint/suspicious/noExplicitAny: better-auth context type isn't publicly exported
  ctx: any,
  options: CloudflareAccessOptions
) {
  const token =
    ctx.headers?.get(CF_ACCESS_HEADER) ??
    readCookie(ctx.headers, CF_ACCESS_COOKIE);

  if (!token) {
    throw new APIError("UNAUTHORIZED", {
      message: "missing_access_jwt",
    });
  }

  try {
    return await verifyAccessJwt(token, {
      teamDomain: options.teamDomain,
      audience: options.audience,
      kv: options.kv,
    });
  } catch (err) {
    throw new APIError("UNAUTHORIZED", {
      message: "invalid_access_jwt",
      cause: (err as Error).message,
    });
  }
}

/**
 * Better Auth plugin that bridges Cloudflare Access. Exposes a single
 * endpoint `POST /cloudflare-access/session` (mounted under
 * `/api/auth/...`). Reads the JWT from either the
 * `cf-access-jwt-assertion` header (set by CF Access on the Worker) or
 * the `CF_Authorization` cookie. Verifies via JWKS, find-or-creates the
 * matching Better Auth user, and issues a session cookie.
 *
 * Wire it into `createAuth(env)`:
 *
 *   betterAuth({
 *     plugins: [cloudflareAccess({
 *       teamDomain: env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
 *       audience: env.CLOUDFLARE_ACCESS_AUD,
 *       kv: env.KV,
 *     })]
 *   })
 */
// Return type is intentionally inferred (not annotated `: BetterAuthPlugin`):
// the precise `endpoints` shape has to survive so Better Auth's `InferAPI`
// exposes `auth.api.cloudflareAccessSession` to callers. The `satisfies`
// below still enforces plugin conformance.
export function cloudflareAccess(options: CloudflareAccessOptions) {
  const endpointPath = options.endpoint ?? "/cloudflare-access/session";

  return {
    id: "cloudflare-access",
    endpoints: {
      cloudflareAccessSession: createAuthEndpoint(
        endpointPath,
        { method: "POST" },
        async (ctx) => {
          const payload = await authenticateRequest(ctx, options);

          const email = payload.email;
          const name =
            (typeof payload.name === "string" && payload.name) ||
            email.split("@")[0] ||
            email;

          const user = await upsertAccessUser(ctx, email, name);

          const session = await ctx.context.internalAdapter.createSession(
            user.id
          );
          if (!session) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "session_creation_failed",
            });
          }

          await setSessionCookie(ctx, { session, user });

          return ctx.json({
            ok: true,
            user: { id: user.id, email: user.email, name: user.name },
            session: { id: session.id, token: session.token },
          });
        }
      ),
    },
  } satisfies BetterAuthPlugin;
}

/**
 * Cheap presence check for a Cloudflare Access token on a request, used by
 * the SSR session path to decide whether to attempt an auto-sign-in before
 * paying for JWKS verification. Mirrors the lookup in `authenticateRequest`:
 * the `cf-access-jwt-assertion` header (set by CF Access on the Worker) with
 * the `CF_Authorization` cookie as fallback. Presence does not imply the
 * token is valid — the endpoint still verifies it.
 */
export function hasCloudflareAccessToken(headers: Headers): boolean {
  return Boolean(
    headers.get(CF_ACCESS_HEADER) ?? readCookie(headers, CF_ACCESS_COOKIE)
  );
}

/**
 * Read a cookie value from a Headers object without depending on a parser.
 * Cookies arrive as a single `cookie` header; split on `;` and look for
 * the named pair. Returns `undefined` when missing.
 */
function readCookie(
  headers: Headers | undefined,
  name: string
): string | undefined {
  const raw = headers?.get("cookie");
  if (!raw) {
    return undefined;
  }
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const k = part.slice(0, eq).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
