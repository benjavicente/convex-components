/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    uploads: {
      confirm: FunctionReference<
        "action",
        "internal",
        { uploadId: string },
        | {
            status: "ready";
            upload: {
              bucket: string;
              contentType: string;
              key: string;
              name: string;
              sha256: string;
              size: number;
              uploadId: string;
            };
          }
        | { status: "notUploaded" }
        | { reason: string; status: "rejected" }
        | { status: "missing" },
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { uploadId: string },
        | {
            bucket: string;
            contentType: string;
            expiresAt: number;
            key: string;
            link: string;
            name: string;
            sha256: string;
            size: number;
            status: "pending";
            uploadId: string;
          }
        | {
            bucket: string;
            contentType: string;
            key: string;
            link: string;
            name: string;
            sha256: string;
            size: number;
            status: "ready";
            uploadId: string;
          }
        | null,
        Name
      >;
      getUrl: FunctionReference<
        "query",
        "internal",
        {
          disposition?: "inline" | "attachment";
          expiresIn?: number;
          uploadId: string;
        },
        string | null,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { uploadId: string },
        null,
        Name
      >;
      request: FunctionReference<
        "mutation",
        "internal",
        {
          bucket?: string;
          context: any;
          file: {
            contentType: string;
            name: string;
            sha256: string;
            size: number;
          };
          keyPrefix: string;
          onConfirm: import("convex/server").FunctionHandle_future<
            "mutation",
            any,
            any
          >;
          rules: { contentTypes: Array<string>; maxSize: number };
        },
        {
          expiresAt: number;
          headers: Record<string, string>;
          key: string;
          uploadId: string;
          url: string;
        },
        Name
      >;
    };
  };
