# @benjavicente/convex-r2

## 0.0.2

### Patch Changes

- 5eb15b2: Breaking: `confirm` returns only `{ status }`, plus `reason` when rejected. Anyone with an upload id may call it, so it no longer returns the name, key, bucket or SHA-256; read those in `onConfirm` or with `r2.get`.
- 5eb15b2: Breaking: `r2.store` returns `StoreResult`, `{ uploadId, result }`, and PUTs once, then runs `onConfirm` in one mutation without a HEAD: R2 only accepts the signed PUT when the bytes match.
- 5eb15b2: A file that doesn't match its request is rejected with "The file doesn't match its upload request". The expected size, type and hash are logged instead of returned.
- 5eb15b2: The sweep waits a minute plus a second per MB after the URL expires, up to 30 minutes, instead of a fixed 10 minutes.
- 5eb15b2: When the sweep discards a request whose file hadn't arrived, it deletes the key again a day later, so a slow PUT that lands afterwards doesn't stay in the bucket.
- 5eb15b2: The generated component types match the validators again, so `confirm`'s result type no longer promises an `upload` field.
- 5eb15b2: The README compares the same upload with `@convex-dev/r2`, and the package has its own flow tests.

## 0.0.1

First release.
