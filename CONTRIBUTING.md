# Contributing

pnpm workspace, Node >= 22.12. Packages import each other's **built** output, so run
`pnpm build` after changing `@switchyard/core` before testing a package that depends on it.

## The gate

Run all of these before pushing. CI runs the same.

```bash
pnpm install
pnpm format:check
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## Decorators

The library ships dual-mode decorators: TC39 standard (`accessor` fields, `Symbol.metadata`)
and the legacy ones Ember apps compile with via decorator-transforms. Every decorator gets a
test under both. Reflection (diagrams, `toGraph()`) reads a `WeakMap` registry keyed by the
class, never `Symbol.metadata`, because legacy mode doesn't have it.

## Releasing

Changesets, with a tag-triggered `release.yml` and OIDC trusted publishing, the same as
real-enums. `release.yml` lands with the first 0.x publish (plan, Phase 0). Add a changeset
(`npx changeset`) to any PR that changes a published package.
