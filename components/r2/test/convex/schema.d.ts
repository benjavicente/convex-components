declare const _default: import("convex/server").SchemaDefinition<
  {
    documents: import("convex/server").TableDefinition<
      import("convex/values").VObject<
        {
          name: string;
          uploadId: string;
        },
        {
          uploadId: import("convex/values").VString<string, "required">;
          name: import("convex/values").VString<string, "required">;
        },
        "required",
        "name" | "uploadId"
      >,
      {},
      {},
      {}
    >;
  },
  true
>;
export default _default;
