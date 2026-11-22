# @switchyard-ts/interop

## 0.1.0

### Minor Changes

- 3e3b711: `@transition({ event })` names an event apart from its method (`event: 'stop'`, `'media.ended'`);
  decorated methods may no longer shadow Machine's own members. In a parallel machine, a
  transition with no `from` stays in its target's region instead of resetting every region.
  Diagrams draw transitions handled in every state from an "any state" marker. Codegen uses
  `event` for reserved and non-identifier event names.
- b64b1b1: Interop: `toXState()` exports xstate v5 JSON, `fromXState()` imports an xstate config as a
  runnable config, `toClassSource()` generates a decorated class from one, and `toScxml()` /
  `fromScxml()` write and read W3C SCXML.

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
- Updated dependencies [450f2b3]
- Updated dependencies [6f190a0]
- Updated dependencies [c26a6ab]
- Updated dependencies [ae083c6]
- Updated dependencies [c600cc6]
- Updated dependencies [a5b6f24]
- Updated dependencies [3f99e65]
  - @switchyard-ts/core@0.1.0
