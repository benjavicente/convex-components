// A minimal app for the package's tests: one upload type whose `onConfirm`
// writes a row, then refuses the upload when `context.refuse` is set.
import { ConvexError, v } from "convex/values";
import {
  fileValidator,
  R2,
  uploadValidator,
  type ConfirmResult,
  type RequestedUpload,
} from "../../src/client/index.js";
import { components, internal } from "./_generated/api.js";
import { action, internalMutation, mutation, query } from "./_generated/server.js";

export const r2 = new R2(components.r2);

export const RULES = { maxSize: 1024, contentTypes: ["application/pdf", "text/plain"] };

export const request = mutation({
  args: { file: fileValidator, refuse: v.optional(v.boolean()) },
  handler: (ctx, { file, refuse = false }): Promise<RequestedUpload> =>
    r2.requestUpload(ctx, {
      keyPrefix: "docs",
      file,
      rules: RULES,
      onConfirm: internal.app.onConfirm,
      context: { refuse },
    }),
});

export const onConfirm = internalMutation({
  args: { upload: uploadValidator, context: v.object({ refuse: v.boolean() }) },
  handler: async (ctx, { upload, context }) => {
    await ctx.db.insert("documents", { uploadId: upload.uploadId, name: upload.name });
    if (context.refuse) throw new ConvexError("Refused by the app");
  },
});

export const confirm = action({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.confirm(ctx, uploadId),
});

export const store = action({
  args: { text: v.string() },
  handler: (ctx, { text }): Promise<ConfirmResult & { uploadId: string }> =>
    r2.store(ctx, {
      keyPrefix: "notes",
      file: new Blob([text], { type: "text/plain" }),
      name: "note.txt",
      onConfirm: internal.app.onConfirm,
      context: { refuse: false },
    }),
});

export const get = query({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.get(ctx, uploadId),
});

export const getUrl = query({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.getUrl(ctx, uploadId, { disposition: "attachment" }),
});

export const remove = mutation({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.delete(ctx, uploadId),
});

export const documents = query({
  args: {},
  handler: (ctx) => ctx.db.query("documents").collect(),
});
