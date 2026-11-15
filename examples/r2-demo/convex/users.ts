import { vGithubProfile } from "@convex-dev/auth/methods/github/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { currentUserId } from "./lib/auth";

/** Coins a new user starts with. */
export const STARTING_COINS = 5;

export const createUser = internalMutation({
  args: { method: v.object({ name: v.literal("github"), profile: vGithubProfile }) },
  handler: (ctx, { method: { profile } }) =>
    ctx.db.insert("users", {
      login: profile.login,
      ...(profile.avatarUrl === undefined ? {} : { avatarUrl: profile.avatarUrl }),
      coins: STARTING_COINS,
    }),
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx, { optional: true });
    return userId && ctx.db.get("users", userId);
  },
});
