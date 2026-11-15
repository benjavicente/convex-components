import { fileValidator, type RequestedUpload, uploadValidator } from "@benjavicente/convex-r2";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentUserId } from "./lib/auth";
import { assertCoins, spendCoins } from "./lib/coins";
import { r2 } from "./lib/r2";

/** Small images: up to 10 KB for 1 coin. */
const COST = 1;

export const requestUpload = mutation({
  args: { label: v.string(), ...fileValidator.fields },
  handler: async (ctx, { label, ...file }): Promise<RequestedUpload> => {
    const ownerId = await currentUserId(ctx);
    await assertCoins(ctx, ownerId, COST);
    return r2.requestUpload(ctx, {
      keyPrefix: `stickers/${ownerId}`,
      file,
      rules: {
        maxSize: 10 * 1024,
        contentTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
      },
      onConfirm: internal.stickers.onUploaded,
      context: { ownerId, label },
    });
  },
});

export const onUploaded = internalMutation({
  args: {
    upload: uploadValidator,
    context: v.object({ ownerId: v.id("users"), label: v.string() }),
  },
  handler: async (ctx, { upload, context }) => {
    await spendCoins(ctx, context.ownerId, COST);
    await ctx.db.insert("stickers", { ...context, uploadId: upload.uploadId });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await currentUserId(ctx);
    return ctx.db
      .query("stickers")
      .withIndex("ownerId", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

/** A mutation, so the signed URL is fresh rather than a cached query result. */
export const url = mutation({
  args: { stickerId: v.id("stickers") },
  handler: async (ctx, { stickerId }): Promise<string | null> => {
    const sticker = await ctx.db.get("stickers", stickerId);
    if (sticker?.ownerId !== (await currentUserId(ctx))) return null;
    return r2.getUrl(ctx, sticker.uploadId, { expiresIn: 60 * 60 });
  },
});

export const remove = mutation({
  args: { stickerId: v.id("stickers") },
  handler: async (ctx, { stickerId }) => {
    const sticker = await ctx.db.get("stickers", stickerId);
    if (sticker?.ownerId !== (await currentUserId(ctx))) return;
    await ctx.db.delete("stickers", stickerId);
    await r2.delete(ctx, sticker.uploadId);
  },
});
