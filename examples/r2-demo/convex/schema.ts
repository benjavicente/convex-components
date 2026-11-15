import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Upload tables hold confirmed files only: each upload type's `onUploaded` inserts them.
export default defineSchema({
  users: defineTable({
    login: v.string(),
    avatarUrl: v.optional(v.string()),
    coins: v.number(),
  }),
  stickers: defineTable({
    ownerId: v.id("users"),
    uploadId: v.string(),
    label: v.string(),
  }).index("ownerId", ["ownerId"]),
  documents: defineTable({
    ownerId: v.id("users"),
    uploadId: v.string(),
    title: v.string(),
    fileName: v.string(),
    size: v.number(),
  }).index("ownerId", ["ownerId"]),
});
