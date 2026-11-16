import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { RETENTION_MS } from "./lib/pricing";
import { r2 } from "./lib/r2";

const BATCH = 100;

/** Deletes up to a batch of rows older than `cutoff`, with their files; true if more remain. */
async function deleteBefore(ctx: MutationCtx, table: "stickers" | "documents", cutoff: number) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
    .take(BATCH);
  for (const row of rows) {
    await ctx.db.delete(table, row._id);
    await r2.delete(ctx, row.uploadId);
  }
  return rows.length === BATCH;
}

/** Run daily by `crons.ts`; reschedules itself until every old upload is gone. */
export const deleteOldUploads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    const moreStickers = await deleteBefore(ctx, "stickers", cutoff);
    const moreDocuments = await deleteBefore(ctx, "documents", cutoff);
    if (moreStickers || moreDocuments) {
      await ctx.scheduler.runAfter(0, internal.cleanup.deleteOldUploads, {});
    }
  },
});
