# @switchyard-ts/test

## 0.2.0

### Patch Changes

- @switchyard-ts/core@0.2.0
  - @switchyard-ts/graph@0.2.0

## 0.1.0

### Minor Changes

- cbc576f: Testing: `@switchyard-ts/test` finds shortest and simple model paths, reports state and
  transition coverage, and ships `toBeIn` (vitest/jest), `assert.machineIn` (QUnit) and
  `useManualClock`. `@switchyard-ts/harnessed` turns model paths into tests that drive the real UI
  through a harnessed harness.

### Patch Changes

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
  - @switchyard-ts/graph@0.1.0
