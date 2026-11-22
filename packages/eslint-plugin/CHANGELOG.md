# @switchyard-ts/eslint-plugin

## 0.3.0

### Minor Changes

- 8c4f52d: Guards can point at the getter they read, `guard: (m: Fetch) => m.hasRetriesLeft`, so TypeScript
  checks the name; diagrams still label it `hasRetriesLeft`. `m.can(FetchState.Loading)` asks
  whether some event would enter a state now, and `{ via: m.retry }` asks about one event. The
  Ember `can` helper takes a state too: `(can this.fetch FetchState.Loading via=this.fetch.retry)`.
  Guard names and `m.can.retry` keep working.

  `m.can()` and `m.matches()` take only the machine's states, and reject every other state.
  **Breaking:** each state enum declares `private declare readonly brand: never` (type-only;
  TypeScript compares classes by shape, and a private member makes each enum its own type), and an
  enum with `children` or `regions` names them, `class FetchState extends State<Attempt>`.
  `State.of` checks that `children` is that enum. The new `switchyard/state-brand` lint rule
  (in `recommended`) reports a missing brand and adds it.

### Patch Changes

- 8df225f: Doc comments on every export that lacked one, which now show in editors and in the API reference at https://joegaudet.com/switchyard/api/.

## 0.2.0

No changes in this release.

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
