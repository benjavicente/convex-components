import { v, type Infer } from "convex/values";

/** The file a client declares before uploading. `sha256` is lowercase hex. */
export const fileValidator = v.object({
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  sha256: v.string(),
});
export type FileInfo = Infer<typeof fileValidator>;

export const rulesValidator = v.object({
  maxSize: v.number(),
  contentTypes: v.array(v.string()),
});
export type UploadRules = Infer<typeof rulesValidator>;

/** What the `onConfirm` mutation receives as `upload`. */
export const uploadValidator = v.object({
  uploadId: v.string(),
  bucket: v.string(),
  key: v.string(),
  ...fileValidator.fields,
});
export type Upload = Infer<typeof uploadValidator>;

export const statusValidator = v.union(v.literal("pending"), v.literal("ready"));

export const confirmResultValidator = v.union(
  v.object({ status: v.literal("ready"), upload: uploadValidator }),
  /** The object isn't in R2 yet. */
  v.object({ status: v.literal("notUploaded") }),
  /** The object didn't match the request; both were deleted. */
  v.object({ status: v.literal("rejected"), reason: v.string() }),
  /** No such upload, e.g. already rejected or deleted. */
  v.object({ status: v.literal("missing") }),
);
export type ConfirmResult = Infer<typeof confirmResultValidator>;
