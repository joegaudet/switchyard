# @switchyard-ts/ember

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
