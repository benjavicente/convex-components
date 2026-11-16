# Convex components

[Convex](https://convex.dev) components, in a pnpm monorepo.

| Package                                           | What it does                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| [`@benjavicente/convex-r2`](components/r2#readme) | Uploads from the browser straight to Cloudflare R2. The server checks each file, then runs your `onConfirm` mutation. No webhook needed. |
| [`examples/r2-demo`](examples/r2-demo#readme)     | A demo of it with GitHub sign-in and two upload types. Live at https://r2-demo.benjavicente.workers.dev.                                 |

## Development

Requires pnpm and Vite+ (`vp`).

```sh
pnpm install
pnpm run ready  # build, then format, lint, typecheck and test
```

## License

MIT
