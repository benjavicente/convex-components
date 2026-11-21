---
"@benjavicente/convex-r2": patch
---

When the sweep discards a request whose file hadn't arrived, it deletes the key again a day later, so a slow PUT that lands afterwards doesn't stay in the bucket.
