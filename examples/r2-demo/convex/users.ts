import { vGithubProfile } from "@convex-dev/auth/methods/github/server";
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { currentUserId } from "./lib/auth";
import { coinsLeft } from "./lib/coins";

export const createUser = internalMutation({
  args: { method: v.object({ name: v.literal("github"), profile: vGithubProfile }) },
  handler: (ctx, { method: { profile } }) =>
    ctx.db.insert("users", {
      login: profile.login,
      ...(profile.avatarUrl === undefined ? {} : { avatarUrl: profile.avatarUrl }),
    }),
});

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await currentUserId(ctx, { optional: true });
    const user = userId && (await ctx.db.get("users", userId));
    return user && { ...user, coins: await coinsLeft(ctx, user._id) };
  },
});
