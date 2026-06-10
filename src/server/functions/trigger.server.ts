/**
 * Server-only re-export of the Trigger.dev SDK primitives.
 *
 * `@trigger.dev/sdk` has no `sideEffects: false`, so when a server-
 * function module imports it at the top level, the bundler can't tree-
 * shake it out of the *client* build even though the calls only ever run
 * inside server handlers. The result was ~200KB of `@trigger.dev/core`
 * (plus `@electric-sql/client`, `@opentelemetry/api`, seroval, …) landing
 * in the entry chunk loaded on every page.
 *
 * Routing every dispatch through this `.server.ts` module fixes that:
 * TanStack Start's build never resolves a `.server` file into the client
 * graph, so the SDK is excluded from the browser bundle entirely while
 * the SSR / Worker build still gets the real thing. Same trick as
 * `shortlist-helpers.server.ts`.
 *
 * Only `auth`, `schedules`, and `tasks` are used from server functions —
 * `task`/`logger`/`queue` are imported directly inside `src/trigger/*`,
 * which is bundled by Trigger.dev, not the client.
 */
export { auth, schedules, tasks } from "@trigger.dev/sdk";
