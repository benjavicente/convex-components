# @benjavicente/convex-r2

Uploads to Cloudflare R2 from a Convex app, where every object belongs to a row the server created first.

- The app defines one request mutation per upload type. It authorizes the user, then asks the component for a URL.
- The component generates the key (`<prefix>/<upload id>`). It signs a 5-minute PUT bound to the declared `Content-Type`, `Content-Length` and SHA-256, plus `If-None-Match: *`, so the PUT can't overwrite an existing object.
- After the PUT, the server checks the real object against the request. On a match, it runs the app's `onConfirm` mutation with `{ upload, context }` and marks the upload ready, in one transaction. On a mismatch, or when `onConfirm` throws, it deletes the request and schedules the object's deletion.
- Requests that are never confirmed are checked after they expire: they are confirmed if the object matches, and deleted otherwise.
- Credentials come from the component's env vars and never become function arguments. There are no runtime dependencies (SigV4 on WebCrypto).

## Setup

1. Create an R2 API token with **Object Read & Write**, scoped to the buckets the app uses (one Cloudflare account per component instance).
2. Allow the browser's PUT in each bucket's CORS policy:

   ```json
   [
     {
       "AllowedOrigins": ["https://app.example.com"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type", "if-none-match", "x-amz-checksum-sha256"]
     }
   ]
   ```

3. Install the component and bind its env vars to the app's, by reference, so the values stay in the deployment's env:

   ```ts
   // convex/convex.config.ts
   import r2 from "@benjavicente/convex-r2/convex.config.js";
   import { defineApp } from "convex/server";
   import { v } from "convex/values";

   const app = defineApp({
     env: {
       R2_ACCOUNT_ID: v.string(),
       R2_ACCESS_KEY_ID: v.string(),
       R2_SECRET_ACCESS_KEY: v.string(),
       R2_BUCKET: v.string(),
     },
   });
   app.use(r2, {
     env: {
       R2_ACCOUNT_ID: app.env.R2_ACCOUNT_ID,
       R2_ACCESS_KEY_ID: app.env.R2_ACCESS_KEY_ID,
       R2_SECRET_ACCESS_KEY: app.env.R2_SECRET_ACCESS_KEY,
       R2_BUCKET: app.env.R2_BUCKET, // optional: the default bucket
     },
   });
   export default app;
   ```

   ```sh
   npx convex env set R2_ACCOUNT_ID ...   # and the other three
   ```

## Server

```ts
import { fileValidator, R2, type RequestedUpload, uploadValidator } from "@benjavicente/convex-r2";

const r2 = new R2(components.r2); // or new R2(components.r2, { bucket: "other" })

export const requestUpload = mutation({
  args: { companyId: v.id("companies"), ...fileValidator.fields },
  // The annotation breaks the type cycle through `internal`.
  handler: async (ctx, { companyId, ...file }): Promise<RequestedUpload> => {
    const user = await currentUser(ctx);
    await assertCanUploadTo(ctx, user, companyId);
    // Throws a ConvexError, whose message the client sees, when the file breaks the rules.
    return r2.requestUpload(ctx, {
      keyPrefix: `companies/${companyId}`,
      file,
      rules: { maxSize: 20 * 1024 * 1024, contentTypes: ["application/pdf"] },
      onConfirm: internal.companyDocuments.onUploaded,
      context: { companyId, uploadedBy: user._id }, // checked against onUploaded's `context`
    });
  },
});

export const onUploaded = internalMutation({
  args: {
    upload: uploadValidator,
    context: v.object({ companyId: v.id("companies"), uploadedBy: v.id("users") }),
  },
  handler: async (ctx, { upload, context }) => {
    // Throwing rejects the upload and deletes it. The message of a
    // ConvexError("...") reaches the client as the rejection reason, and anyone
    // who confirms this upload id sees it, so leave file names out. Any other
    // error rejects it too, including a missing function after a rename, so
    // keep this name while uploads are pending.
    await ctx.db.insert("companyDocuments", {
      ...context,
      uploadId: upload.uploadId,
      name: upload.name,
    });
  },
});

// Needs no authorization: it only compares R2 with the stored request, and
// returns a status (and a reason when rejected), never the file's details. A
// mismatch is reported without the expected values, which are logged instead.
export const confirmUpload = action({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.confirm(ctx, uploadId),
});
```

From an action, `r2.store` uploads bytes the server already has. It records the request, PUTs the file, then runs `onConfirm` with your `context`, as a browser upload would. It skips the HEAD: R2 only accepts a PUT signed for the file's size and SHA-256 when the bytes match. It returns the `uploadId` and the same result as `confirm`:

```ts
export const writeNote = action({
  args: {},
  handler: async (ctx): Promise<StoreResult> => {
    const user = await ctx.runQuery(api.users.me, {});
    if (!user) throw new ConvexError("Sign in first");
    return r2.store(ctx, {
      keyPrefix: `notes/${user._id}`,
      file: new Blob(["# Hello"], { type: "text/markdown" }),
      name: "hello.md",
      onConfirm: internal.notes.onUploaded,
      context: { ownerId: user._id },
    });
  },
});
```

Also available:

- `r2.get(ctx, uploadId)` returns a ready upload with its Cloudflare dashboard link, or null. Pending uploads stay internal: the app hears about a file through `onConfirm`.
- `r2.getUrl(ctx, uploadId, { expiresIn, disposition })` returns a signed GET that serves the file under its name, for ready uploads only.

  > A Convex query's result stays cached until the data it read changes, not until the URL inside it expires, so a subscribed page can keep showing an expired URL. Sign from a mutation or action when the URL must be fresh, or use an `expiresIn` longer than the page lives.

- `r2.delete(ctx, uploadId)` deletes the upload and its object.

## Browser

```ts
import { uploadFile } from "@benjavicente/convex-r2/browser";

const { confirmed } = await uploadFile(file, {
  request: (info) => convex.mutation(api.companyDocuments.requestUpload, { companyId, ...info }),
  confirm: (uploadId) => convex.action(api.companyDocuments.confirmUpload, { uploadId }), // optional
  onProgress: ({ loaded, total }) => {},
  signal, // AbortSignal
});
```

`uploadFile` hashes the file (reading it into memory), PUTs it with XHR for progress, then calls `confirm`. Without `confirm`, the upload is confirmed after the URL expires plus a grace period: a minute, plus a second per MB, up to 30 minutes.

## Compared with `@convex-dev/r2`

Measured against version 0.10.4.

|                                 | `@convex-dev/r2`                                                                                          | this package                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Object key                      | A UUID, or a custom key from your mutation. Uploading to an existing key overwrites it.                   | Always `<prefix>/<upload id>`, generated by the component. `If-None-Match: *` refuses a second upload to the same key.          |
| What the upload URL is bound to | Bucket and key, for 15 minutes.                                                                           | Key, `Content-Type`, `Content-Length` and SHA-256, for 5 minutes.                                                               |
| When your callback runs         | `onUpload(ctx, bucket, key)` runs when the client calls `syncMetadata`, before anything reads the object. | `onConfirm({ upload, context })` runs only after the stored object matches the request, in the transaction that marks it ready. |
| Data for the callback           | The key only.                                                                                             | A typed `context` set when the URL is requested, checked against `onConfirm`'s arguments.                                       |
| Refusing an upload              | Throw in `checkUpload`; the object stays in the bucket.                                                   | Throw in `onConfirm`; the object and its request are deleted, and the `ConvexError` message is returned.                        |
| Uploads never confirmed         | Stay in the bucket.                                                                                       | Checked after the URL expires: confirmed if they match, deleted otherwise.                                                      |
| Credentials                     | App env vars, passed to the component as function arguments, so scheduled jobs store them.                | Component env vars bound by reference. They are never function arguments.                                                       |
| Browser                         | React, Svelte and Vue hooks.                                                                              | `uploadFile`, framework-agnostic, with hashing, progress and `AbortSignal`.                                                     |
| Signing                         | AWS SDK v3.                                                                                               | About 100 lines of SigV4 on WebCrypto, tested against the AWS SDK's signer.                                                     |

`@convex-dev/r2` also lists every object's metadata, and accepts custom keys and per-bucket credentials. Here the app's own tables reference their uploads, so listing is the app's own query; keys are always server-generated; and one component instance uses one Cloudflare account.

### The same upload in both

A document upload from [the demo](../../examples/r2-demo/convex/documents.ts): signed-in users only, at most 40 KB of PDF, text or Markdown, with a title, and a coin it costs checked when the URL is requested and again when the file arrives.

With this package, the checks, the title and the callback travel with the request:

```ts
export const requestUpload = mutation({
  args: { title: v.string(), ...fileValidator.fields },
  handler: async (ctx, { title, ...file }): Promise<RequestedUpload> => {
    const ownerId = await currentUserId(ctx);
    title = requiredText(title, "A document needs a title");
    await assertCoins(ctx, ownerId, DOCUMENTS.cost);
    return r2.requestUpload(ctx, {
      keyPrefix: `documents/${ownerId}`,
      file,
      rules: { maxSize: DOCUMENTS.maxSize, contentTypes: DOCUMENTS.contentTypes },
      onConfirm: internal.documents.onUploaded,
      context: { ownerId, title },
    });
  },
});

export const onUploaded = internalMutation({
  args: {
    upload: uploadValidator,
    context: v.object({ ownerId: v.id("users"), title: v.string() }),
  },
  handler: async (ctx, { upload, context }) => {
    await assertCoins(ctx, context.ownerId, DOCUMENTS.cost);
    const { uploadId, name, size } = upload;
    await ctx.db.insert("documents", { ...context, uploadId, fileName: name, size });
  },
});
```

With `@convex-dev/r2`, `syncMetadata` receives only the key, so the app keeps the request in its own table. The URL doesn't bind size or type, so they are checked after the upload, and a refused object is deleted by hand:

```ts
// schema.ts: one more table for requests in flight.
pendingDocuments: defineTable({
  key: v.string(),
  ownerId: v.id("users"),
  title: v.string(),
  fileName: v.string(),
}).index("key", ["key"]),

// documents.ts
export const r2 = new R2(components.r2);
const callbacks: R2Callbacks = internal.documents;

// The client calls this instead of the generated `generateUploadUrl`,
// which takes no arguments.
export const requestUpload = mutation({
  args: { title: v.string(), fileName: v.string() },
  handler: async (ctx, { title, fileName }) => {
    const ownerId = await currentUserId(ctx);
    title = requiredText(title, "A document needs a title");
    await assertCoins(ctx, ownerId, DOCUMENTS.cost);
    const { key, url } = await r2.generateUploadUrl(`documents/${ownerId}/${crypto.randomUUID()}`);
    await ctx.db.insert("pendingDocuments", { key, ownerId, title, fileName });
    return { key, url };
  },
});

export const { syncMetadata, onSyncMetadata } = r2.clientApi<DataModel>({
  callbacks,
  checkUpload: async (ctx) => {
    await currentUserId(ctx);
  },
  // Runs in a later transaction, after the component's action read the object.
  // `syncMetadata` has already returned, so a throw here doesn't reach the
  // client; it has to watch a query to learn the outcome.
  onSyncMetadata: async (ctx, { key }) => {
    const pending = await ctx.db
      .query("pendingDocuments")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
    if (!pending) return;
    await ctx.db.delete(pending._id);
    const { ownerId, title, fileName } = pending;
    const metadata = await r2.getMetadata(ctx, key);
    const size = metadata?.size ?? 0;
    const accepted =
      size > 0 &&
      size <= DOCUMENTS.maxSize &&
      DOCUMENTS.contentTypes.includes(metadata?.contentType ?? "") &&
      (await coinsLeft(ctx, ownerId)) >= DOCUMENTS.cost;
    if (!accepted) return await r2.deleteObject(ctx, key);
    await ctx.db.insert("documents", { ownerId, title, key, fileName, size });
  },
});
```

On top of that, `useUploadFile` calls the generated `generateUploadUrl`, so the client needs its own upload code. A request whose file never arrives stays in `pendingDocuments` until a cron cleans it up. A file uploaded without `syncMetadata` is never checked: it stays in the bucket and no row refers to it.

### Size

Each figure is the bundle growth over a control module with one trivial function. The bundles are built with esbuild settings that reproduce Convex's bundler: renamed identifiers, whitespace kept, external source maps. A real Convex push of the `@convex-dev/r2` app side came out slightly larger: 583 KB of JS and 703 KB of maps.

| Added by the package                   | `@convex-dev/r2`         | this package               |
| -------------------------------------- | ------------------------ | -------------------------- |
| App functions: JS / gzip / source maps | 540 / 131 / 681 KB       | 2.9 / 0.9 / 2.8 KB         |
| Component functions: JS / gzip / maps  | 472 / 114 / 619 KB       | 20 / 4.9 / 23 KB           |
| Browser helper (min / gzip)            | React hook: 0.6 / 0.4 KB | `uploadFile`: 1.3 / 0.7 KB |
| `node_modules`                         | ~22 MB, 17 packages      | no dependencies            |
