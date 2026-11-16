/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as documents from "../documents.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_coins from "../lib/coins.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as lib_r2 from "../lib/r2.js";
import type * as stickers from "../stickers.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  cleanup: typeof cleanup;
  crons: typeof crons;
  documents: typeof documents;
  "lib/auth": typeof lib_auth;
  "lib/coins": typeof lib_coins;
  "lib/pricing": typeof lib_pricing;
  "lib/r2": typeof lib_r2;
  stickers: typeof stickers;
  uploads: typeof uploads;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authGithub: import("@convex-dev/auth/components/github/_generated/component.js").ComponentApi<"authGithub">;
  r2: import("@benjavicente/convex-r2/_generated/component.js").ComponentApi<"r2">;
};
