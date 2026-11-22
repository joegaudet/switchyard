# Contributing

pnpm workspace, Node >= 22.12. Packages import each other's **built** output, so run
`pnpm build` after changing `@switchyard-ts/core` before testing a package that depends on it.

## The gate

Run all of these before pushing. CI runs the same.

```bash
pnpm install
pnpm format:check
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:ember   # QUnit in headless Chrome, through test-app/
```

## Ember

`packages/ember` is a v2 addon built with `@embroider/addon-dev`. `test-app/` compiles its
machines with Ember's own Babel (decorator-transforms), so the legacy decorator path is tested
there end to end, as well as in `packages/core/tests/dsl`.

## Decorators

The library ships dual-mode decorators: TC39 standard (`accessor` fields, `Symbol.metadata`)
and the legacy ones Ember apps compile with via decorator-transforms. Every decorator gets a
test under both. Standard decorators record on `context.metadata`; legacy ones, which have
no metadata, record in a `WeakMap` keyed by the prototype. `decorationsOf()` in
`packages/core/src/machine.ts` reads both.

## Releasing

A release is cut by pushing a tag. Nothing publishes on merge.

1. PRs that change a published package carry a changeset (`pnpm changeset`). While any are
   pending on `main`, CI keeps a "chore: version packages" PR open with the next version and
   the changelogs.
2. Merge that PR.
3. Tag the merge commit with the new version and push the tag:

   ```bash
   git switch main && git pull
   git tag -a v1.2.3 -m v1.2.3
   git push origin v1.2.3
   ```

`release.yml` checks that the tag is on `main` and matches every public package's version,
publishes whatever is not already on npm through `scripts/publish.mjs` (OIDC trusted publishing
with provenance; there is no `NPM_TOKEN`), then creates the GitHub release. If a run fails, re-run
it: it skips what is already published.

**A brand-new package** cannot publish through OIDC: npm only configures a trusted publisher for
a name that already exists. Its first release goes out once through `bootstrap-publish.yml` with
a short-lived token (restore that file from git history if it has been deleted; its header has
the steps). After that, set `joegaudet/switchyard` / `release.yml` as the package's trusted
publisher on npmjs.com.

The version PR is opened by a GitHub App, not `GITHUB_TOKEN`: GitHub runs no workflows for
pushes made with `GITHUB_TOKEN`, so the PR would never get its required checks. One App serves
every repository that uses this workflow. To set it up:

1. Create a GitHub App (Settings → Developer settings → GitHub Apps → New) with webhooks off and
   repository permissions **Contents: read and write** and **Pull requests: read and write**.
2. Install it on this repository.
3. Generate a private key, then in this repository (Settings → Secrets and variables → Actions)
   add the variable `RELEASE_APP_CLIENT_ID` (the App's client ID) and the secret
   `RELEASE_APP_PRIVATE_KEY` (the whole `.pem` file).

Until the App is configured, `release.yml`'s version job is skipped rather than failing.

**First release checklist** (needs the maintainer):

1. Create the `@switchyard-ts` npm org (`@switchyard` belongs to someone else).
2. Create the release App, install it, and add `RELEASE_APP_CLIENT_ID` / `RELEASE_APP_PRIVATE_KEY`.
3. Merge the version PR, tag, and dispatch `bootstrap-publish.yml` once for the new names.
4. Set `joegaudet/switchyard` / `release.yml` as each package's trusted publisher; delete
   `bootstrap-publish.yml` and the token.
