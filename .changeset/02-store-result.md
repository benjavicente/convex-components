---
"@benjavicente/convex-r2": patch
---

Breaking: `r2.store` returns `StoreResult`, `{ uploadId, result }`, and PUTs once, then runs `onConfirm` in one mutation without a HEAD: R2 only accepts the signed PUT when the bytes match.
