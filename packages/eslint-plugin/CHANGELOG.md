# @switchyard-ts/eslint-plugin

## 0.1.0

### Minor Changes

- 3f99e65: Tooling: the `switchyard` CLI (diagram, export, import; payload types from source) with a Vite
  plugin at `@switchyard-ts/cli/vite`; an ESLint plugin (unreachable states, unknown guards,
  non-exhaustive state switches); `connectInspector()` for the Stately Inspector; and
  `@switchyard-ts/skills`. `interfaceToMermaid` takes method signatures. `spawn` notifies.

### Patch Changes

- a5b6f24: Runtime type checks use `@sindresorhus/is` instead of `typeof`, now a dependency of these
  packages. A Standard Schema whose `~standard` is on a function (as some validators' are) is
  recognised as one.
