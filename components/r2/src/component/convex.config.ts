import { defineComponent } from "convex/server";
import { v } from "convex/values";

export default defineComponent("r2", {
  env: {
    R2_ACCOUNT_ID: v.string(),
    R2_ACCESS_KEY_ID: v.string(),
    R2_SECRET_ACCESS_KEY: v.string(),
    /** Bucket used when a call doesn't name one. */
    R2_BUCKET: v.optional(v.string()),
  },
});
