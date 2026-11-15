import { fileValidator, type RequestedUpload, uploadValidator } from "@benjavicente/convex-r2";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { currentUserId } from "./lib/auth";
import { assertCoins, spendCoins } from "./lib/coins";
import { r2 } from "./lib/r2";

/** Documents: up to 50 KB for 3 coins. */
const COST = 3;

export const requestUpload = mutation({
  args: { title: v.string(), ...fileValidator.fields },
  handler: async (ctx, { title, ...file }): Promise<RequestedUpload> => {
    const ownerId = await currentUserId(ctx);
    if (!title.trim()) throw new Error("A document needs a title");
    await assertCoins(ctx, ownerId, COST);
    return r2.requestUpload(ctx, {
      keyPrefix: `documents/${ownerId}`,
      file,
      rules: {
        maxSize: 50 * 1024,
        contentTypes: ["application/pdf", "text/plain", "text/markdown"],
      },
      onConfirm: internal.documents.onUploaded,
      context: { ownerId, title: title.trim() },
    });
  },
});

export const onUploaded = internalMutation({
  args: {
    upload: uploadValidator,
    context: v.object({ ownerId: v.id("users"), title: v.string() }),
  },
  handler: async (ctx, { upload, context }) => {
    await spendCoins(ctx, context.ownerId, COST);
    const { uploadId, name, size } = upload;
    await ctx.db.insert("documents", { ...context, uploadId, fileName: name, size });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await currentUserId(ctx);
    return ctx.db
      .query("documents")
      .withIndex("ownerId", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .collect();
  },
});

/** A mutation, so the signed URL is fresh rather than a cached query result. */
export const url = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }): Promise<string | null> => {
    const document = await ctx.db.get("documents", documentId);
    if (document?.ownerId !== (await currentUserId(ctx))) return null;
    return r2.getUrl(ctx, document.uploadId, { disposition: "attachment" });
  },
});

export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await ctx.db.get("documents", documentId);
    if (document?.ownerId !== (await currentUserId(ctx))) return;
    await ctx.db.delete("documents", documentId);
    await r2.delete(ctx, document.uploadId);
  },
});
