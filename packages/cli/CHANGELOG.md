# @switchyard-ts/cli

## 0.3.0

### Patch Changes

- 8df225f: Doc comments on every export that lacked one, which now show in editors and in the API reference at https://joegaudet.com/switchyard/api/.
- Updated dependencies [8df225f]
- Updated dependencies [8c4f52d]
  - @switchyard-ts/graph@0.3.0
  - @switchyard-ts/interop@0.3.0
  - @switchyard-ts/core@0.3.0

## 0.2.0

### Patch Changes

- @switchyard-ts/core@0.2.0
  - @switchyard-ts/graph@0.2.0
  - @switchyard-ts/interop@0.2.0

## 0.1.0

### Minor Changes

- 3f99e65: Tooling: the `switchyard` CLI (diagram, export, import; payload types from source) with a Vite
  plugin at `@switchyard-ts/cli/vite`; an ESLint plugin (unreachable states, unknown guards,
  non-exhaustive state switches); `connectInspector()` for the Stately Inspector; and
  `@switchyard-ts/skills`. `interfaceToMermaid` takes method signatures. `spawn` notifies.

### Patch Changes

- c26a6ab: Fixes from the pre-release review. `toClassSource` (and `switchyard import`) writes every name
  from an xstate or SCXML file as an escaped literal, an identifier or a one-line comment, so an
  imported file can't add code to the generated class. A machine with a named `@after` delay can
  `restore()` and validate its snapshots. `can` never raises `error.execution` when a guard throws,
  and `m.can.method` answers for a method whose `event:` names it apart. The CLI rebuilds when a
  file the machine module imports changes, and the Vite plugin watches those files.
- a5b6f24: Runtime type checks use `@sindresorhus/is` instead of `typeof`, now a dependency of these
  packages. A Standard Schema whose `~standard` is on a function (as some validators' are) is
  recognised as one.
- Updated dependencies [2cd083a]
- Updated dependencies [7e258c5]
- Updated dependencies [3e3b711]
- Updated dependencies [3696d2f]
- Updated dependencies [d820e57]
- Updated dependencies [821df28]
- Updated dependencies [b64b1b1]
- Updated dependencies [450f2b3]
- Updated dependencies [6f190a0]
- Updated dependencies [c26a6ab]
- Updated dependencies [ae083c6]
- Updated dependencies [c600cc6]
- Updated dependencies [a5b6f24]
- Updated dependencies [3f99e65]
  - @switchyard-ts/core@0.1.0
  - @switchyard-ts/graph@0.1.0
  - @switchyard-ts/interop@0.1.0
