# @benjavicente/convex-r2

Uploads to Cloudflare R2 from a Convex app, where every object belongs to a row the server created first.

- The app defines one request mutation per upload type. It authorizes the user, then asks the component for a URL.
- The component generates the key (`<prefix>/<upload id>`). It signs a 5-minute PUT bound to the declared `Content-Type`, `Content-Length` and SHA-256, plus `If-None-Match: *`, so the PUT can't overwrite an existing object.
- After the PUT, the server checks the real object against the request. On a match, it runs the app's `onConfirm` mutation with `{ upload, context }` and marks the upload ready, in one transaction. On a mismatch, or when `onConfirm` throws, it deletes both the object and the request at once.
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
    // ConvexError("...") reaches the client as the rejection reason. Any other
    // error rejects it too, including a missing function after a rename, so
    // keep this name while uploads are pending.
    await ctx.db.insert("companyDocuments", {
      ...context,
      uploadId: upload.uploadId,
      name: upload.name,
    });
  },
});

// Needs no authorization: it only compares R2 with the stored request.
export const confirmUpload = action({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.confirm(ctx, uploadId),
});
```

From an action, `r2.store` uploads bytes the server already has. It goes through the same request, PUT and confirm steps, so `onConfirm` and `context` work the same, and it returns the same result as `confirm`:

```ts
export const writeNote = action({
  args: {},
  handler: async (ctx): Promise<ConfirmResult> => {
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

`uploadFile` hashes the file (reading it into memory), PUTs it with XHR for progress, then calls `confirm`. Without `confirm`, the upload is confirmed after the URL expires plus a grace period: a minute, plus a second per MB, up to 15 minutes.

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
| Browser                         | React and Svelte hooks.                                                                                   | `uploadFile`, framework-agnostic, with hashing, progress and `AbortSignal`.                                                     |
| Signing                         | AWS SDK v3.                                                                                               | About 100 lines of SigV4 on WebCrypto, tested against the AWS SDK's signer.                                                     |

`@convex-dev/r2` also lists every object's metadata, and accepts custom keys and per-bucket credentials. Here the app's own tables reference their uploads, so listing is the app's own query; keys are always server-generated; and one component instance uses one Cloudflare account.

### Size

Each figure is the bundle growth over a control module with one trivial function. The bundles are built with esbuild settings that reproduce Convex's bundler: renamed identifiers, whitespace kept, external source maps. A real Convex push of the `@convex-dev/r2` app side came out slightly larger: 583 KB of JS and 703 KB of maps.

| Added by the package                   | `@convex-dev/r2`         | this package               |
| -------------------------------------- | ------------------------ | -------------------------- |
| App functions: JS / gzip / source maps | 540 / 131 / 681 KB       | 2.9 / 0.9 / 2.8 KB         |
| Component functions: JS / gzip / maps  | 472 / 114 / 619 KB       | 20 / 4.9 / 23 KB           |
| Browser helper (min / gzip)            | React hook: 0.6 / 0.4 KB | `uploadFile`: 1.3 / 0.7 KB |
| `node_modules`                         | ~22 MB, 17 packages      | no dependencies            |
