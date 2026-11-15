# @benjavicente/convex-r2

Uploads to Cloudflare R2 from a Convex app, where every object belongs to a row the server created first.

- The app defines one request mutation per upload type. It authorizes the user, then asks the component for a URL.
- The component generates the key (`<prefix>/<upload id>`). It signs a 5-minute PUT bound to the declared `Content-Type`, `Content-Length` and SHA-256, plus `If-None-Match: *`, so the PUT can't overwrite an existing object.
- After the PUT, the server checks the real object against the request. On a match, it marks the upload ready and runs the app's `onConfirm` mutation with `{ upload, context }` in one transaction. On a mismatch, it deletes both the object and the request.
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
    // Throwing here rejects the upload; expiry then deletes it.
    await ctx.db.insert("companyDocuments", { ...context, uploadId: upload.uploadId, name: upload.name });
  },
});

// Needs no authorization: it only compares R2 with the stored request.
export const confirmUpload = action({
  args: { uploadId: v.string() },
  handler: (ctx, { uploadId }) => r2.confirm(ctx, uploadId),
});
```

Also available:

- `r2.get(ctx, uploadId)` returns the upload with its status, expiry and Cloudflare dashboard link.
- `r2.getUrl(ctx, uploadId, { expiresIn, disposition })` returns a signed GET that serves the file under its name, for ready uploads only. A query's result stays cached until the data changes, even after the URL expires, so sign from a mutation or action when the URL must be fresh.
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

`uploadFile` hashes the file (reading it into memory), PUTs it with XHR for progress, then calls `confirm`. Without `confirm`, the upload is confirmed after the URL expires plus 10 minutes of grace.
