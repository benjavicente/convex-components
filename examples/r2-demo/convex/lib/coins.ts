import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { DOCUMENTS, STARTING_COINS, STICKERS } from "./pricing";

/** Coins left: what the user started with, minus the cost of the files they keep. */
export async function coinsLeft(ctx: QueryCtx, ownerId: Id<"users">) {
  const owned = (table: "stickers" | "documents") =>
    ctx.db
      .query(table)
      .withIndex("ownerId", (q) => q.eq("ownerId", ownerId))
      .collect();
  const [stickers, documents] = await Promise.all([owned("stickers"), owned("documents")]);
  return STARTING_COINS - stickers.length * STICKERS.cost - documents.length * DOCUMENTS.cost;
}

/**
 * Throws a `ConvexError`, whose message reaches the client, when the user
 * can't pay. Requests call it to fail early; `onConfirm` calls it again right
 * before inserting the row that spends the coins, which rejects the upload
 * when two pending ones both passed the first check.
 */
export async function assertCoins(ctx: QueryCtx, ownerId: Id<"users">, cost: number) {
  const coins = await coinsLeft(ctx, ownerId);
  if (coins < cost) throw priceError(cost, coins);
}

/** The `ConvexError` the client shows when the user can't pay. */
export function priceError(cost: number, coins: number) {
  return new ConvexError(`This costs ${cost} ${cost === 1 ? "coin" : "coins"}; you have ${coins}`);
}
