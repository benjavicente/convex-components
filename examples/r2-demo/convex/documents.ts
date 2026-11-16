import {
  type ConfirmResult,
  fileValidator,
  type RequestedUpload,
  uploadValidator,
} from "@benjavicente/convex-r2";
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { currentUserId } from "./lib/auth";
import { assertCoins, priceError } from "./lib/coins";
import { requiredText } from "./lib/text";
import { DOCUMENTS } from "./lib/pricing";
import { r2 } from "./lib/r2";

export const requestUpload = mutation({
  args: { title: v.string(), ...fileValidator.fields },
  handler: async (ctx, { title, ...file }): Promise<RequestedUpload> => {
    const ownerId = await currentUserId(ctx);
    title = requiredText(title, "A document needs a title");
    await assertCoins(ctx, ownerId, DOCUMENTS.cost);
    return r2.requestUpload(ctx, {
      keyPrefix: `documents/${ownerId}`,
      file,
      rules: { maxSize: DOCUMENTS.maxSize, contentTypes: DOCUMENTS.contentTypes },
      onConfirm: internal.documents.onUploaded,
      context: { ownerId, title },
    });
  },
});

/** The server writes the file itself, with `r2.store`; it still costs a document's price. */
export const writeNote = action({
  args: {},
  handler: async (ctx): Promise<ConfirmResult> => {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me) throw new ConvexError("Sign in first");
    if (me.coins < DOCUMENTS.cost) throw priceError(DOCUMENTS.cost, me.coins);
    const ownerId = me._id;
    const date = new Date().toISOString().slice(0, 10);
    const note = `# A note from the server\n\nWritten for ${me.login} on ${date} with \`r2.store\`.\n`;
    return r2.store(ctx, {
      keyPrefix: `documents/${ownerId}`,
      file: new Blob([note], { type: "text/markdown" }),
      name: `note-${date}.md`,
      onConfirm: internal.documents.onUploaded,
      context: { ownerId, title: "A note from the server" },
    });
  },
});

export const onUploaded = internalMutation({
  args: {
    upload: uploadValidator,
    context: v.object({ ownerId: v.id("users"), title: v.string() }),
  },
  handler: async (ctx, { upload, context }) => {
    await assertCoins(ctx, context.ownerId, DOCUMENTS.cost);
    const { uploadId, name, size } = upload;
    await ctx.db.insert("documents", { ...context, uploadId, fileName: name, size });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await currentUserId(ctx, { optional: true });
    if (!ownerId) return [];
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
