import { v } from "convex/values";
import { action } from "./_generated/server";
import { r2 } from "./lib/r2";

/** Shared by every upload type. Needs no authorization: it only compares R2 with the stored request. */
export const confirm = action({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.confirm(ctx, uploadId),
});
