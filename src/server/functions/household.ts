/**
 * Household + invite server functions.
 *
 * Households are the unit of search ownership in Gaff — every search,
 * every swipe, every mutual-match aggregation hangs off
 * `household_id`. These functions cover the lifecycle a user sees in
 * `/settings/household`:
 *
 *   getHousehold     — read the current user's household + members
 *   createInvite     — owner-only; mints a single-use token
 *   acceptInvite     — accept by token (sign-in already enforced)
 *   removeMember     — owner-only; deletes a membership row
 *
 * Tokens live in Better Auth's `verification` table — same row shape
 * Better Auth uses for password-reset / email-verify, so we get free
 * cleanup on expiry. The `identifier` column is namespaced as
 * `household-invite:${householdId}` so accept-time can recover the
 * target household without an extra column.
 */
import { env } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "../../../db";
import {
  type Household,
  householdMembers,
  households,
  user,
  verification,
} from "../../../db/schema";
import type { Env } from "../../server";
import { getCurrentUser } from "./session";

const INVITE_NAMESPACE = "household-invite:";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type HouseholdMemberRow = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
  userId: string;
};

export type HouseholdPayload = {
  household: Household;
  members: HouseholdMemberRow[];
};

/**
 * Internal helper — finds the current user's household and lists every
 * member with their user details joined in. Used by both `getHousehold`
 * (over the wire) and the household-context provider's loader.
 */
async function loadHouseholdFor(userId: string): Promise<HouseholdPayload> {
  const db = getDb(env as unknown as Env);

  const membership = await db.query.householdMembers.findFirst({
    where: (hm, { eq: eqOp }) => eqOp(hm.userId, userId),
  });
  if (!membership) {
    throw new Error("no_household");
  }

  const household = await db.query.households.findFirst({
    where: (h, { eq: eqOp }) => eqOp(h.id, membership.householdId),
  });
  if (!household) {
    throw new Error("household_missing");
  }

  const rows = await db
    .select({
      id: householdMembers.id,
      userId: householdMembers.userId,
      role: householdMembers.role,
      email: user.email,
      name: user.name,
    })
    .from(householdMembers)
    .innerJoin(user, eq(user.id, householdMembers.userId))
    .where(eq(householdMembers.householdId, household.id));

  return {
    household,
    members: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      role: r.role,
      email: r.email,
      name: r.name,
    })),
  };
}

export const getHousehold = createServerFn({ method: "GET" }).handler(
  async (): Promise<HouseholdPayload> => {
    const session = await getCurrentUser();
    if (!session) {
      throw new Error("unauthorized");
    }
    return loadHouseholdFor(session.userId);
  }
);

const inviteCreateSchema = z.object({}).optional();

export const createInvite = createServerFn({ method: "POST" })
  .inputValidator(inviteCreateSchema)
  .handler(async (): Promise<{ token: string; url: string }> => {
    const session = await getCurrentUser();
    if (!session) {
      throw new Error("unauthorized");
    }

    const db = getDb(env as unknown as Env);
    const payload = await loadHouseholdFor(session.userId);
    const me = payload.members.find((m) => m.userId === session.userId);
    if (me?.role !== "owner") {
      throw new Error("forbidden");
    }

    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const now = new Date();

    await db.insert(verification).values({
      id: nanoid(),
      identifier: `${INVITE_NAMESPACE}${payload.household.id}`,
      value: token,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    const base =
      (env as unknown as Env).BETTER_AUTH_URL ?? "http://localhost:3000";
    return { token, url: `${base}/invite/${token}` };
  });

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const acceptInvite = createServerFn({ method: "POST" })
  .inputValidator(acceptInviteSchema)
  .handler(async ({ data }): Promise<{ householdId: string }> => {
    const session = await getCurrentUser();
    if (!session) {
      throw new Error("unauthorized");
    }

    const db = getDb(env as unknown as Env);
    const row = await db.query.verification.findFirst({
      where: (v, { eq: eqOp, and: andOp, like: likeOp }) =>
        andOp(
          eqOp(v.value, data.token),
          likeOp(v.identifier, "household-invite:%")
        ),
    });

    if (!row) {
      throw new Error("invalid_token");
    }
    if (row.expiresAt.getTime() < Date.now()) {
      throw new Error("expired_token");
    }

    const householdId = row.identifier.slice(INVITE_NAMESPACE.length);
    if (!householdId) {
      throw new Error("malformed_token");
    }

    // Idempotent: if the user is already in the household, accept the
    // invite quietly and burn the token. Avoids surfacing a confusing
    // error when someone double-clicks the link.
    const existing = await db.query.householdMembers.findFirst({
      where: (hm, { eq: eqOp, and: andOp }) =>
        andOp(
          eqOp(hm.userId, session.userId),
          eqOp(hm.householdId, householdId)
        ),
    });

    if (!existing) {
      // Drop the auto-created solo household if this user only has one
      // membership and it's their own auto-created household — we
      // can't have a user belong to two households cleanly.
      const myMemberships = await db.query.householdMembers.findMany({
        where: (hm, { eq: eqOp }) => eqOp(hm.userId, session.userId),
      });
      for (const m of myMemberships) {
        if (m.role === "owner") {
          // Remove the solo household entirely — schema cascades the
          // membership and any searches the user had there.
          await db.delete(households).where(eq(households.id, m.householdId));
        } else {
          await db
            .delete(householdMembers)
            .where(eq(householdMembers.id, m.id));
        }
      }

      await db.insert(householdMembers).values({
        id: nanoid(),
        householdId,
        userId: session.userId,
        role: "member",
      });
    }

    // Single-use: drop the verification row whether or not we created
    // a new membership.
    await db.delete(verification).where(eq(verification.id, row.id));

    return { householdId };
  });

const removeMemberSchema = z.object({
  memberId: z.string().min(1),
});

export const removeMember = createServerFn({ method: "POST" })
  .inputValidator(removeMemberSchema)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const session = await getCurrentUser();
    if (!session) {
      throw new Error("unauthorized");
    }

    const db = getDb(env as unknown as Env);
    const payload = await loadHouseholdFor(session.userId);
    const me = payload.members.find((m) => m.userId === session.userId);
    if (me?.role !== "owner") {
      throw new Error("forbidden");
    }

    const target = payload.members.find((m) => m.id === data.memberId);
    if (!target) {
      throw new Error("member_not_found");
    }
    if (target.role === "owner") {
      throw new Error("cannot_remove_owner");
    }

    await db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.id, data.memberId),
          eq(householdMembers.householdId, payload.household.id)
        )
      );

    return { ok: true };
  });
