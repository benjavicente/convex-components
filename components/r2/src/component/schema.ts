import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { fileValidator } from "./validators.js";

const object = {
  bucket: v.string(),
  /** `<keyPrefix>/<upload id>`; empty only between insert and patch. */
  key: v.string(),
  ...fileValidator.fields,
};

export default defineSchema({
  /**
   * One row per R2 object, created before its upload URL is signed. What
   * confirming needs is dropped once the upload is ready.
   */
  uploads: defineTable(
    v.union(
      v.object({
        ...object,
        status: v.literal("pending"),
        /** When the upload URL expires. */
        expiresAt: v.number(),
        /** Handle of the app's mutation, run with `{ upload, context }`. */
        onConfirm: v.function({ fnType: "mutation" }),
        context: v.any(),
      }),
      v.object({ ...object, status: v.literal("ready") }),
    ),
  ),
});
