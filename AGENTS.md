# Convex components

A pnpm monorepo of Convex components, on the Vite+ toolchain (`vp`: Vitest, Oxlint, Oxfmt).

- `components/<name>/`: one package per component (`components/r2`: `@benjavicente/convex-r2`).
- `examples/<name>/`: Convex apps that use them; their tests cover the end-to-end flows.

## Commands

Run from the root unless noted. Use the local `vp` (`pnpm exec vp`, or a global `vp` of the same version).

- `pnpm install`
- `vp run ready`: build, then format/lint/typecheck (`vp check`) and test everything. Run it before committing.
- `vp check --fix`: format and fix lint.
- `vp run -r build`: build packages to `dist/`. Examples import the built package, so build after changing a component.
- `vp test` (in a package): run its tests.
- Codegen (in `examples/r2-demo`): `pnpm run codegen`. It regenerates the component's and the app's `_generated/`, which are committed. It needs the example's deployment; with none, run `CONVEX_AGENT_MODE=anonymous pnpm exec convex dev --once` there first (a local backend, no account).
- Real R2 checks (in `components/r2`): `pnpm run test:r2` with `R2_TEST_ACCOUNT_ID`, `R2_TEST_ACCESS_KEY_ID`, `R2_TEST_SECRET_ACCESS_KEY` and `R2_TEST_BUCKET` set. Skipped without them.

## Conventions

- English everywhere. Conventional commits, small and coherent. No AI co-author trailers or attribution.
- A change to a published package needs a changeset (`pnpm changeset`, or a file in `.changeset/`). Never bump versions or publish by hand: the Release workflow does both.
- Pin dependencies exactly. Ones shared by several packages go in the `catalog` of `pnpm-workspace.yaml` and are referenced as `catalog:`; the rest are pinned in their package's `package.json`.
- Prefer tool defaults; a comment next to each non-default setting says why.
- One source per fact; no config or docs without a current need.
- Import test and config helpers from `vite-plus` (`vite-plus/test`), not `vitest` or `vite`.
- Secrets never enter the repo, function arguments or stored rows: components read them from their declared `env`.
