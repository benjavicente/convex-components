---
"@benjavicente/convex-r2": patch
---

Breaking: `confirm` returns only `{ status }`, plus `reason` when rejected. Anyone with an upload id may call it, so it no longer returns the name, key, bucket or SHA-256; read those in `onConfirm` or with `r2.get`.
