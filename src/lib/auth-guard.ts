/**
 * Auth guard helpers for route loaders.
 *
 * `requireSession` reads `currentUserId` from the router context (set in
 * `src/routes/__root.tsx`'s `beforeLoad`). If absent it throws a
 * `redirect({ to: "/login" })` so the user lands on the sign-in form
 * with their original destination preserved in the `next` search param.
 *
 * `redirectIfSignedIn` is the inverse — used by `/login` and `/signup`
 * so an already-authenticated user gets bounced back to `/`.
 */

import { redirect } from "@tanstack/react-router";

export function requireSession(
  ctx: { currentUserId: string | null },
  fromHref: string
): string {
  if (!ctx.currentUserId) {
    throw redirect({
      to: "/login",
      search: { next: fromHref },
    });
  }
  return ctx.currentUserId;
}

export function redirectIfSignedIn(ctx: {
  currentUserId: string | null;
}): void {
  if (ctx.currentUserId) {
    throw redirect({ to: "/" });
  }
}
