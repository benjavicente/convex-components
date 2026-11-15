import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  /** Only confirmed uploads; `onUploaded` inserts them. */
  documents: defineTable({
    folder: v.string(),
    uploadId: v.string(),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
  }).index("folder", ["folder", "name"]),
});
