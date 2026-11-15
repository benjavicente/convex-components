import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Fails early, at request time, when the user can't pay for an upload. */
export async function assertCoins(ctx: QueryCtx, userId: Id<"users">, cost: number) {
  const user = await ctx.db.get("users", userId);
  if (!user || user.coins < cost) {
    throw new ConvexError(`This costs ${cost} coins; you have ${user?.coins ?? 0}`);
  }
  return user;
}

/**
 * Charges when the upload is confirmed. A `ConvexError` here rejects the
 * upload, and its message reaches the client, e.g. when two pending uploads
 * both passed `assertCoins`.
 */
export async function spendCoins(ctx: MutationCtx, userId: Id<"users">, cost: number) {
  const user = await assertCoins(ctx, userId, cost);
  await ctx.db.patch("users", userId, { coins: user.coins - cost });
}
