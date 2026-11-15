import { fileValidator, R2, type RequestedUpload, uploadValidator } from "@benjavicente/convex-r2";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";

const r2 = new R2(components.r2);

const contextValidator = v.object({ folder: v.string() });

/** One upload type. A real app authorizes the user for `folder` here. */
export const requestUpload = mutation({
  args: { folder: v.string(), ...fileValidator.fields },
  handler: async (ctx, { folder, ...file }): Promise<RequestedUpload> => {
    return r2.requestUpload(ctx, {
      keyPrefix: `folders/${folder}`,
      file,
      rules: {
        maxSize: 10 * 1024 * 1024,
        contentTypes: ["application/pdf", "image/png", "image/jpeg", "text/plain"],
      },
      onConfirm: internal.documents.onUploaded,
      context: { folder },
    });
  },
});

/** Runs when the upload is confirmed; throwing rejects it. */
export const onUploaded = internalMutation({
  args: { upload: uploadValidator, context: contextValidator },
  handler: async (ctx, { upload, context }) => {
    const { uploadId, name, contentType, size } = upload;
    const existing = await ctx.db
      .query("documents")
      .withIndex("folder", (q) => q.eq("folder", context.folder).eq("name", name))
      .first();
    if (existing) throw new Error(`${name} already exists in ${context.folder}`);
    await ctx.db.insert("documents", { ...context, uploadId, name, contentType, size });
  },
});

/** Needs no authorization: it only checks R2 against the stored request. */
export const confirmUpload = action({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.confirm(ctx, uploadId),
});

export const list = query({
  args: { folder: v.string() },
  handler: async (ctx, { folder }) => {
    return ctx.db
      .query("documents")
      .withIndex("folder", (q) => q.eq("folder", folder))
      .collect();
  },
});

/** A mutation, so the URL is fresh rather than a cached query result. */
export const getUrl = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }): Promise<string | null> => {
    const document = await ctx.db.get("documents", documentId);
    return document && r2.getUrl(ctx, document.uploadId, { disposition: "attachment" });
  },
});

export const remove = mutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await ctx.db.get("documents", documentId);
    if (!document) return;
    await ctx.db.delete("documents", documentId);
    await r2.delete(ctx, document.uploadId);
  },
});
