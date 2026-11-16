import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Doc } from "./_generated/dataModel.js";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server.js";
import {
  dashboardLink,
  deleteObject as deleteR2Object,
  headObject,
  hexToBase64,
  presignObject,
  r2Config,
  resolveBucket,
  type ObjectHead,
} from "./r2.js";
import {
  confirmResultValidator,
  fileValidator,
  rulesValidator,
  uploadValidator,
  type ConfirmResult,
  type FileInfo,
  type Upload,
  type UploadRules,
} from "./validators.js";

/** Lifetime of an upload URL, in seconds. */
export const UPLOAD_URL_EXPIRES_IN = 5 * 60;
/**
 * Time after URL expiry for an upload that started in time to finish: a
 * minute, plus the file at 1 MB/s, up to 30 minutes. R2 checks expiry when the
 * PUT starts, so a slower upload of a large file can still be discarded
 * mid-way and leave an orphan object.
 */
export function sweepGraceMs(size: number) {
  return Math.min(60_000 + size / 1000, 30 * 60_000);
}
/** R2's limit for a single PUT. */
const MAX_PUT_SIZE = 5 * 1024 ** 3;
/** R2 calls retried by scheduled jobs: 4 s, 16 s, … up to about 6 hours in total. */
const ATTEMPTS = 8;
const retryDelay = (attempt: number) => 1000 * 4 ** attempt;

function toUpload(row: Doc<"uploads">): Upload {
  const { _id, bucket, key, name, contentType, size, sha256 } = row;
  return { uploadId: _id, bucket, key, name, contentType, size, sha256 };
}

/** Throws a `ConvexError`, so the client sees why its file was refused. */
function checkFile(file: FileInfo, rules: UploadRules) {
  if (!file.name) throw new ConvexError("File name is empty");
  if (!rules.contentTypes.includes(file.contentType)) {
    throw new ConvexError(`Content type ${file.contentType} is not allowed`);
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new ConvexError("File size must be a positive integer");
  }
  if (file.size > Math.min(rules.maxSize, MAX_PUT_SIZE)) {
    throw new ConvexError(`File is larger than ${Math.min(rules.maxSize, MAX_PUT_SIZE)} bytes`);
  }
  if (!/^[0-9a-f]{64}$/.test(file.sha256)) {
    throw new ConvexError("sha256 must be 64 lowercase hex characters");
  }
}

function checkKeyPrefix(prefix: string) {
  const segments = prefix.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error(`Invalid key prefix "${prefix}": use non-empty segments without "." or ".."`);
  }
}

/** Why the object doesn't match its request, or null if it does. */
function mismatch(row: Doc<"uploads">, head: ObjectHead): string | null {
  if (head.size !== row.size) return `size is ${head.size}, expected ${row.size}`;
  if (head.contentType !== row.contentType) {
    return `content type is ${head.contentType}, expected ${row.contentType}`;
  }
  if (head.sha256 !== row.sha256) return `sha256 is ${head.sha256}, expected ${row.sha256}`;
  return null;
}

/**
 * The reason to report when `onConfirm` throws. Only a `ConvexError` with a
 * string is shown to the client; other errors may carry internals.
 */
function refusal(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  console.error("onConfirm threw; rejecting the upload", error);
  return "The upload was refused";
}

async function loadRow(ctx: QueryCtx, uploadId: string) {
  const id = ctx.db.normalizeId("uploads", uploadId);
  return id ? ctx.db.get("uploads", id) : null;
}

async function removeRow(ctx: MutationCtx, row: Doc<"uploads">) {
  await ctx.db.delete("uploads", row._id);
  await ctx.scheduler.runAfter(0, internal.uploads.deleteObject, {
    bucket: row.bucket,
    key: row.key,
    attempt: 1,
  });
}

/**
 * Records an upload request and signs a single-use PUT URL bound to the
 * declared file. The caller authorizes; this only checks the file against
 * `rules`.
 */
export const request = mutation({
  args: {
    bucket: v.optional(v.string()),
    keyPrefix: v.string(),
    file: fileValidator,
    rules: rulesValidator,
    onConfirm: v.function({ fnType: "mutation" }),
    context: v.any(),
  },
  returns: v.object({
    uploadId: v.string(),
    key: v.string(),
    url: v.string(),
    headers: v.record(v.string(), v.string()),
    expiresAt: v.number(),
  }),
  handler: async (ctx, { keyPrefix, file, rules, onConfirm, context, ...args }) => {
    checkFile(file, rules);
    checkKeyPrefix(keyPrefix);
    const bucket = resolveBucket(args.bucket);
    const now = Date.now();
    const expiresAt = now + UPLOAD_URL_EXPIRES_IN * 1000;

    const uploadId = await ctx.db.insert("uploads", {
      bucket,
      key: "",
      ...file,
      pending: { expiresAt, onConfirm, context },
    });
    const key = `${keyPrefix}/${uploadId}`;
    await ctx.db.patch("uploads", uploadId, { key });
    await ctx.scheduler.runAt(expiresAt + sweepGraceMs(file.size), internal.uploads.sweep, {
      uploadId,
      bucket,
      key,
      attempt: 1,
    });

    // Browsers set Content-Length themselves; it is signed but not returned.
    const headers = {
      "Content-Type": file.contentType,
      "If-None-Match": "*",
      "x-amz-checksum-sha256": hexToBase64(file.sha256),
    };
    const url = await presignObject(bucket, key, {
      method: "PUT",
      headers: { ...headers, "Content-Length": String(file.size) },
      expiresIn: UPLOAD_URL_EXPIRES_IN,
      now,
    });
    return { uploadId, key, url, headers, expiresAt };
  },
});

/**
 * Checks the object in R2 against its request. On a match, marks the upload
 * ready and runs `onConfirm` in one transaction. Safe to call from untrusted
 * clients: it only reads R2, and its result has no upload details.
 */
export const confirm = action({
  args: { uploadId: v.string() },
  returns: confirmResultValidator,
  handler: async (ctx, { uploadId }): Promise<ConfirmResult> => {
    const row = await ctx.runQuery(internal.uploads.load, { uploadId });
    if (!row) return { status: "missing" };
    if (!row.pending) return { status: "ready" };
    const head = await headObject(row.bucket, row.key);
    if (!head) return { status: "notUploaded" };
    return ctx.runMutation(internal.uploads.finalize, { uploadId, head });
  },
});

export const load = internalQuery({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => loadRow(ctx, uploadId),
});

export const finalize = internalMutation({
  args: {
    uploadId: v.string(),
    head: v.object({
      size: v.number(),
      contentType: v.union(v.string(), v.null()),
      sha256: v.union(v.string(), v.null()),
    }),
  },
  returns: confirmResultValidator,
  handler: async (ctx, { uploadId, head }): Promise<ConfirmResult> => {
    const row = await loadRow(ctx, uploadId);
    if (!row) return { status: "missing" };
    if (!row.pending) return { status: "ready" };
    const { onConfirm, context } = row.pending;
    const reason = mismatch(row, head);
    if (reason) {
      await removeRow(ctx, row);
      return { status: "rejected", reason };
    }
    try {
      // A throwing callback rolls back its own writes only, so the app
      // refuses an upload by throwing and the rejection below still commits.
      await ctx.runMutation(onConfirm, { upload: toUpload(row), context });
    } catch (error) {
      await removeRow(ctx, row);
      return { status: "rejected", reason: refusal(error) };
    }
    await ctx.db.patch("uploads", row._id, { pending: undefined });
    return { status: "ready" };
  },
});

/**
 * Runs once per request after its URL expired: confirms an upload the client
 * never confirmed, or deletes the request and any object. When the row is
 * already gone (rejected or deleted), it deletes the key anyway: until the URL
 * expired, the client could PUT the file again.
 */
export const sweep = internalAction({
  args: { uploadId: v.id("uploads"), bucket: v.string(), key: v.string(), attempt: v.number() },
  handler: async (ctx, args) => {
    const { uploadId } = args;
    try {
      const row = await ctx.runQuery(internal.uploads.load, { uploadId });
      if (row && !row.pending) return;
      if (!row) return await deleteR2Object(args.bucket, args.key);
      const head = await headObject(row.bucket, row.key);
      if (head) await ctx.runMutation(internal.uploads.finalize, { uploadId, head });
      else await ctx.runMutation(internal.uploads.discard, { uploadId });
    } catch (error) {
      if (args.attempt >= ATTEMPTS) throw error;
      await ctx.scheduler.runAfter(retryDelay(args.attempt), internal.uploads.sweep, {
        ...args,
        attempt: args.attempt + 1,
      });
    }
  },
});

/** Deletes a request that is still pending, and its object. */
export const discard = internalMutation({
  args: { uploadId: v.id("uploads") },
  handler: async (ctx, { uploadId }) => {
    const row = await ctx.db.get("uploads", uploadId);
    if (row?.pending) await removeRow(ctx, row);
  },
});

export const deleteObject = internalAction({
  args: { bucket: v.string(), key: v.string(), attempt: v.number() },
  handler: async (ctx, args) => {
    try {
      await deleteR2Object(args.bucket, args.key);
    } catch (error) {
      if (args.attempt >= ATTEMPTS) throw error;
      await ctx.scheduler.runAfter(retryDelay(args.attempt), internal.uploads.deleteObject, {
        ...args,
        attempt: args.attempt + 1,
      });
    }
  },
});

const uploadInfoValidator = v.object({
  ...uploadValidator.fields,
  /** The object in the Cloudflare dashboard. */
  link: v.string(),
});

/** A ready upload with its dashboard link; null while pending or when missing. */
export const get = query({
  args: { uploadId: v.string() },
  returns: v.union(uploadInfoValidator, v.null()),
  handler: async (ctx, { uploadId }) => {
    const row = await loadRow(ctx, uploadId);
    if (!row || row.pending) return null;
    return { ...toUpload(row), link: dashboardLink(r2Config().accountId, row.bucket, row.key) };
  },
});

/** Deletes an upload, pending or ready, and its object. */
export const remove = mutation({
  args: { uploadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { uploadId }) => {
    const row = await loadRow(ctx, uploadId);
    if (row) await removeRow(ctx, row);
    return null;
  },
});

function contentDisposition(type: "inline" | "attachment", name: string) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Signs a GET URL for a ready upload, served with its file name. Results of a
 * query are cached until the data changes, not until the URL expires, so call
 * this from a mutation or action when the URL must be fresh.
 */
export const getUrl = query({
  args: {
    uploadId: v.string(),
    expiresIn: v.optional(v.number()),
    disposition: v.optional(v.union(v.literal("inline"), v.literal("attachment"))),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { uploadId, expiresIn = 15 * 60, disposition = "inline" }) => {
    // SigV4's limit is 7 days.
    if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 604800) {
      throw new Error("expiresIn must be a whole number of seconds from 1 to 604800");
    }
    const row = await loadRow(ctx, uploadId);
    if (!row || row.pending) return null;
    return presignObject(row.bucket, row.key, {
      method: "GET",
      query: { "response-content-disposition": contentDisposition(disposition, row.name) },
      expiresIn,
    });
  },
});
