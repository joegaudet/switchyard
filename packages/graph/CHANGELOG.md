# @switchyard-ts/graph

## 0.4.0

### Patch Changes

- Updated dependencies [ca2ba5e]
  - @switchyard-ts/core@0.4.0

## 0.3.0

### Patch Changes

- 8df225f: Doc comments on every export that lacked one, which now show in editors and in the API reference at https://joegaudet.com/switchyard/api/.
- Updated dependencies [8c4f52d]
  - @switchyard-ts/core@0.3.0

## 0.2.0

### Patch Changes

- @switchyard-ts/core@0.2.0

## 0.1.0

### Minor Changes

- d820e57: Diagrams: `@switchyard-ts/graph` draws machines as Mermaid, DOT and ELK-laid-out SVG, plus an
  interface view and the live actor topology; `@switchyard-ts/graph/viewer` is a live
  `<switchyard-diagram>` element, and `@switchyard-ts/ember/debug` wraps it as `<SwitchyardDebug>`.
  Core names compiled guards and actions, and lists running child machines on `actors`.
- 3f99e65: Tooling: the `switchyard` CLI (diagram, export, import; payload types from source) with a Vite
  plugin at `@switchyard-ts/cli/vite`; an ESLint plugin (unreachable states, unknown guards,
  non-exhaustive state switches); `connectInspector()` for the Stately Inspector; and
  `@switchyard-ts/skills`. `interfaceToMermaid` takes method signatures. `spawn` notifies.

### Patch Changes

- 3e3b711: `@transition({ event })` names an event apart from its method (`event: 'stop'`, `'media.ended'`);
  decorated methods may no longer shadow Machine's own members. In a parallel machine, a
  transition with no `from` stays in its target's region instead of resetting every region.
  Diagrams draw transitions handled in every state from an "any state" marker. Codegen uses
  `event` for reserved and non-identifier event names.
- 450f2b3: Closing xstate parity gaps: parallel regions inside a state (`State.of(v, { regions })`),
  `waitFor` and `toPromise`, and named delays (`@after('getterName')`, read on entry).
- a5b6f24: Runtime type checks use `@sindresorhus/is` instead of `typeof`, now a dependency of these
  packages. A Standard Schema whose `~standard` is on a function (as some validators' are) is
  recognised as one.
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
