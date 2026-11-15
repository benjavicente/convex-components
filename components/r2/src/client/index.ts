import {
  createFunctionHandle,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
} from "convex/server";
import type { ComponentApi } from "../component/_generated/component.js";
import type { FileInfo, Upload, UploadRules } from "../component/validators.js";

export {
  fileValidator,
  uploadValidator,
  type ConfirmResult,
  type FileInfo,
  type Upload,
  type UploadRules,
} from "../component/validators.js";

type RunQueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type RunMutationCtx = Pick<GenericMutationCtx<GenericDataModel>, "runMutation">;
type RunActionCtx = Pick<GenericActionCtx<GenericDataModel>, "runAction">;

/** The app's mutation that runs when an upload is confirmed. */
export type OnConfirm<Context> = FunctionReference<
  "mutation",
  "internal",
  { upload: Upload; context: Context }
>;

export type RequestUploadArgs<Context> = {
  /** The object key becomes `<keyPrefix>/<upload id>`. */
  keyPrefix: string;
  file: FileInfo;
  rules: UploadRules;
  onConfirm: OnConfirm<Context>;
  /** Passed to `onConfirm`; must match its `context` argument. */
  context: NoInfer<Context>;
};

/**
 * What `requestUpload` returns. Annotate the app's request handler with it:
 * the handler references `internal.*`, which TypeScript can't infer through.
 */
export type RequestedUpload = {
  uploadId: string;
  key: string;
  url: string;
  /** Headers the PUT must send. */
  headers: Record<string, string>;
  expiresAt: number;
};

export class R2 {
  /**
   * @param component `components.r2` (or the name used in `convex.config.ts`).
   * @param options.bucket Bucket for uploads requested through this instance.
   *   Defaults to the component's `R2_BUCKET` env var.
   */
  constructor(
    public readonly component: ComponentApi,
    public readonly options: { bucket?: string } = {},
  ) {}

  /**
   * Records an upload request and returns a URL for a single PUT of exactly
   * the declared file. Authorize the caller before calling this.
   */
  async requestUpload<Context>(
    ctx: RunMutationCtx,
    args: RequestUploadArgs<Context>,
  ): Promise<RequestedUpload> {
    const { bucket } = this.options;
    return ctx.runMutation(this.component.uploads.request, {
      ...(bucket === undefined ? {} : { bucket }),
      keyPrefix: args.keyPrefix,
      file: args.file,
      rules: args.rules,
      onConfirm: await createFunctionHandle(args.onConfirm),
      context: args.context,
    });
  }

  /**
   * Checks the uploaded object against its request and, if it matches, runs
   * `onConfirm`. It trusts nothing but the upload id, so a public action may
   * call it without authorization.
   */
  async confirm(ctx: RunActionCtx, uploadId: string) {
    return ctx.runAction(this.component.uploads.confirm, { uploadId });
  }

  async get(ctx: RunQueryCtx, uploadId: string) {
    return ctx.runQuery(this.component.uploads.get, { uploadId });
  }

  /**
   * Signs a GET URL for a ready upload (null otherwise). Query results are
   * cached until data changes, not until the URL expires.
   */
  async getUrl(
    ctx: RunQueryCtx,
    uploadId: string,
    options: { expiresIn?: number; disposition?: "inline" | "attachment" } = {},
  ) {
    return ctx.runQuery(this.component.uploads.getUrl, { uploadId, ...options });
  }

  /** Deletes the upload and its object. */
  async delete(ctx: RunMutationCtx, uploadId: string) {
    await ctx.runMutation(this.component.uploads.remove, { uploadId });
  }
}
