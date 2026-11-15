import { getAuthUserId } from "@convex-dev/auth/server";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function currentUserId(ctx: QueryCtx): Promise<Id<"users">>;
export async function currentUserId(
  ctx: QueryCtx,
  options: { optional: true },
): Promise<Id<"users"> | null>;
export async function currentUserId(ctx: QueryCtx, options?: { optional: true }) {
  const userId = await getAuthUserId<"users">(ctx, components.auth);
  if (!userId && !options?.optional) throw new Error("Sign in first");
  return userId;
}
