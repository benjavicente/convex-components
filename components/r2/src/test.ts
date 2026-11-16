/// <reference types="vite/client" />
import type { TestConvex } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { ComponentApi } from "./component/_generated/component.js";
import schema from "./component/schema.js";

const modules = import.meta.glob("./component/**/*.ts");

/** Registers the component with a `convex-test` instance. */
export function register(t: TestConvex<SchemaDefinition<GenericSchema, boolean>>, name = "r2") {
  return t.registerComponent(name, schema, modules) as unknown as ComponentApi;
}

export default { register, schema, modules };
