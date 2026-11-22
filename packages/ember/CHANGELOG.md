# @switchyard-ts/ember

## 0.5.0

### Patch Changes

- @switchyard-ts/core@0.5.0
  - @switchyard-ts/graph@0.5.0

## 0.4.0

### Patch Changes

- Updated dependencies [ca2ba5e]
  - @switchyard-ts/core@0.4.0
  - @switchyard-ts/graph@0.4.0

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
- Updated dependencies [8df225f]
- Updated dependencies [8c4f52d]
  - @switchyard-ts/graph@0.3.0
  - @switchyard-ts/core@0.3.0

## 0.2.0

### Patch Changes

- @switchyard-ts/core@0.2.0
  - @switchyard-ts/graph@0.2.0

## 0.1.0

### Minor Changes

- 2cd083a: `configure({ messages })` replaces the text of development warnings and the strict error, so
  apps can localize them. `<SwitchyardAnnouncer>` announces state changes in a polite live region.
- d820e57: Diagrams: `@switchyard-ts/graph` draws machines as Mermaid, DOT and ELK-laid-out SVG, plus an
  interface view and the live actor topology; `@switchyard-ts/graph/viewer` is a live
  `<switchyard-diagram>` element, and `@switchyard-ts/ember/debug` wraps it as `<SwitchyardDebug>`.
  Core names compiled guards and actions, and lists running child machines on `actors`.
- 821df28: `@switchyard-ts/ember`: tracked machine state, `machine(owner, instance)` lifetimes, `send`,
  `matches` and `can` helpers, test waiters for `@invoke` and `@after`, and `machineResource`
  for ember-resources. Core gains `configure()`, the hooks a framework adapter plugs into.

### Patch Changes

- Updated dependencies [2cd083a]
- Updated dependencies [7e258c5]
- Updated dependencies [3e3b711]
- Updated dependencies [3696d2f]
- Updated dependencies [d820e57]
- Updated dependencies [821df28]
- Updated dependencies [450f2b3]
- Updated dependencies [6f190a0]
- Updated dependencies [c26a6ab]
- Updated dependencies [ae083c6]
- Updated dependencies [c600cc6]
- Updated dependencies [a5b6f24]
- Updated dependencies [3f99e65]
  - @switchyard-ts/core@0.1.0
  - @switchyard-ts/graph@0.1.0
