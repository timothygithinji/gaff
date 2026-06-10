/**
 * Request-scoped memoization for server functions.
 *
 * During SSR, a single page render fans out to several server functions
 * (the `/` loader alone fires four), and each independently re-resolves
 * the same things — the session, the household scope, the ranked review
 * queue. Every one of those is a Neon round-trip, and the CF logs showed
 * the median request spending ~0.5s purely waiting on DB subrequests.
 *
 * `requestMemo` dedupes that work *within one request*. TanStack Start
 * runs each request inside an `AsyncLocalStorage` carrying a per-request
 * `H3Event`; `getRequest()` returns that event's stable `req` object. We
 * key a module-global `WeakMap` on it, so entries are isolated per
 * request (concurrent requests in the same isolate get distinct `req`
 * objects) and are garbage-collected when the request ends. There is no
 * cross-request bleed.
 *
 * We cache the *promise*, not the resolved value, so two callers racing
 * in the same `Promise.all` (e.g. `getNextReviewCard` + `getReviewQueue`
 * both computing the ranked queue) share one in-flight query rather than
 * firing two. Rejections are evicted so a later caller can retry.
 *
 * Only meaningful during SSR. On the client, server functions are
 * separate HTTP calls with no shared request, so `getRequest()` throws
 * and we fall through to running `fn` uncached — exactly the existing
 * behaviour.
 */
import { getRequest } from "@tanstack/react-start/server";

const store = new WeakMap<object, Map<string, Promise<unknown>>>();

function currentRequestKey(): object | null {
  try {
    return getRequest();
  } catch {
    // Outside the server request scope (client, or a non-request server
    // context) — nothing stable to key on, so don't memoize.
    return null;
  }
}

/**
 * Resolve `fn` at most once per request for a given `key`. Subsequent
 * calls with the same key in the same request return the cached promise.
 */
export function requestMemo<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const req = currentRequestKey();
  if (!req) {
    return fn();
  }
  let bucket = store.get(req);
  if (!bucket) {
    bucket = new Map();
    store.set(req, bucket);
  }
  const existing = bucket.get(key) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }
  const promise = fn();
  bucket.set(key, promise);
  // Evict on rejection so a retry within the same request isn't pinned to
  // the failed result.
  promise.catch(() => {
    if (store.get(req)?.get(key) === promise) {
      store.get(req)?.delete(key);
    }
  });
  return promise;
}
