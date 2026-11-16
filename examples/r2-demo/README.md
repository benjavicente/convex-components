# R2 uploads demo

Users sign in with GitHub and get 10 coins. Two upload types, each with its own request mutation, rules, `onConfirm` and table:

- **Stickers** (`convex/stickers.ts`): images up to 200 KB for 3 coins, stored with a label.
- **Documents** (`convex/documents.ts`): PDF or text up to 40 KB for 1 coin, stored with a title. `writeNote` also lets an action write one with `r2.store`.

The balance is 10 minus the cost of the files a user keeps, so deleting a file gives its coins back. Each request checks the price before signing, and each `onConfirm` checks it again before inserting the row that spends the coins. When two pending uploads can't both be paid, the second `onConfirm` throws a `ConvexError`, and that upload is rejected and deleted.

Prices and limits live in `convex/lib/pricing.ts`, shared with the page. A daily cron (`convex/crons.ts`) deletes uploads older than 30 days, with their files.

## Run it

1. Start a local backend (no Convex account needed) and note its site URL, usually `http://127.0.0.1:3211`:

   ```sh
   CONVEX_AGENT_MODE=anonymous pnpm exec convex dev --once
   ```

2. Create a GitHub OAuth app with the callback URL `<site URL>/oauth/github/callback`.
3. Create an R2 bucket, an API token with Object Read & Write on it, and this CORS rule:

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:5173"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type", "if-none-match", "x-amz-checksum-sha256"]
     }
   ]
   ```

4. Set the env vars, then run the backend and the page together:

   ```sh
   pnpm exec convex env set AUTH_GITHUB_CLIENT_ID ...
   pnpm exec convex env set AUTH_GITHUB_CLIENT_SECRET ...
   pnpm exec convex env set R2_ACCOUNT_ID ...
   pnpm exec convex env set R2_ACCESS_KEY_ID ...
   pnpm exec convex env set R2_SECRET_ACCESS_KEY ...
   pnpm exec convex env set R2_BUCKET ...
   pnpm run dev
   ```

Open http://localhost:5173.

## Deploy

The live demo is at https://r2-demo.benjavicente.workers.dev: the page is an assets-only Worker, and the backend is the Convex project's production deployment. Its GitHub OAuth app calls back to the production site URL, and the bucket's CORS rule and `allowedRedirectOrigins` in `convex/auth.ts` both list the Worker's URL.

```sh
pnpm run deploy  # convex deploy builds the page with the prod CONVEX_URL, then cf deploys dist
```
