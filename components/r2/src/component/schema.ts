import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { fileValidator } from "./validators.js";

export default defineSchema({
  /** One row per R2 object, created before its upload URL is signed. */
  uploads: defineTable({
    bucket: v.string(),
    /** `<keyPrefix>/<upload id>`; empty only between insert and patch. */
    key: v.string(),
    ...fileValidator.fields,
    /** Present until the upload is confirmed; a row without it is ready. */
    pending: v.optional(
      v.object({
        /** When the upload URL expires. */
        expiresAt: v.number(),
        /** Handle of the app's mutation, run with `{ upload, context }`. */
        onConfirm: v.function({ fnType: "mutation" }),
        context: v.any(),
      }),
    ),
  }),
});
