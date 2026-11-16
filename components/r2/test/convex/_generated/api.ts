// Hand-written stand-in for `convex codegen`, which needs a deployment.
import {
  anyApi,
  componentsGeneric,
  type ApiFromModules,
  type FilterApi,
  type FunctionReference,
} from "convex/server";
import type { ComponentApi } from "../../../src/component/_generated/component.js";
import type * as app from "../app.js";

type FullApi = ApiFromModules<{ app: typeof app }>;

export const api = anyApi as unknown as FilterApi<FullApi, FunctionReference<any, "public">>;
export const internal = anyApi as unknown as FilterApi<
  FullApi,
  FunctionReference<any, "internal">
>;
export const components = componentsGeneric() as unknown as { r2: ComponentApi };
