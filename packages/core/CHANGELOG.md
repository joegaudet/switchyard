# @switchyard-ts/core

## 0.5.0

No changes in this release.

## 0.4.0

### Minor Changes

- ca2ba5e: `emit()` and `on()` take the method an emitted event is named for: `this.emit(this.factClosed)` and
  `m.on(m.factClosed, fn)` deliver and listen for `factClosed`, so TypeScript checks the name. Strings
  keep working.

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

## 0.2.0

No changes in this release.

## 0.1.0

### Minor Changes

- 2cd083a: `configure({ messages })` replaces the text of development warnings and the strict error, so
  apps can localize them. `<SwitchyardAnnouncer>` announces state changes in a polite live region.
- 7e258c5: Actors and time: `@after` on an injectable clock (`manualClock()` for tests), `@invoke`
  (promise, child machine, observable or callback, with an AbortSignal and onDone/onError),
  `spawn`, `sendTo`, `sendParent`, a `system` registry, `emit`/`on`, and `inspect()`.
- 3e3b711: `@transition({ event })` names an event apart from its method (`event: 'stop'`, `'media.ended'`);
  decorated methods may no longer shadow Machine's own members. In a parallel machine, a
  transition with no `from` stays in its target's region instead of resetting every region.
  Diagrams draw transitions handled in every state from an "any state" marker. Codegen uses
  `event` for reserved and non-identifier event names.
- 3696d2f: The decorator DSL: `Machine`, `@transition`, `@always`, `@onEntry`, `@onExit`, `@region`,
  `history()`, and `and`/`or`/`not` guards, in both standard and legacy decorator modes.
- d820e57: Diagrams: `@switchyard-ts/graph` draws machines as Mermaid, DOT and ELK-laid-out SVG, plus an
  interface view and the live actor topology; `@switchyard-ts/graph/viewer` is a live
  `<switchyard-diagram>` element, and `@switchyard-ts/ember/debug` wraps it as `<SwitchyardDebug>`.
  Core names compiled guards and actions, and lists running child machines on `actors`.
- 821df28: `@switchyard-ts/ember`: tracked machine state, `machine(owner, instance)` lifetimes, `send`,
  `matches` and `can` helpers, test waiters for `@invoke` and `@after`, and `machineResource`
  for ember-resources. Core gains `configure()`, the hooks a framework adapter plugs into.
- 450f2b3: Closing xstate parity gaps: parallel regions inside a state (`State.of(v, { regions })`),
  `waitFor` and `toPromise`, and named delays (`@after('getterName')`, read on entry).
- 6f190a0: Persistence: `snapshot()`/`restore()` on interpreters and machines (no actions run; timers and
  invokes restart), `static persist` context fields, `Machine.schema()` as a Standard Schema for
  snapshots, and `bindField()` to keep a machine's state in a record attribute or query param.
- ae083c6: The packages publish under the `@switchyard-ts` scope (`@switchyard-ts/core`, `@switchyard-ts/ember`,
  …): the `@switchyard` npm org belongs to someone else.
- c600cc6: `createInterpreter(config)`: an SCXML interpreter over a plain-data statechart config, with
  hierarchy, parallel regions, history, guards, eventless transitions, final states and
  run-to-completion queues.

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
- 3f99e65: Tooling: the `switchyard` CLI (diagram, export, import; payload types from source) with a Vite
  plugin at `@switchyard-ts/cli/vite`; an ESLint plugin (unreachable states, unknown guards,
  non-exhaustive state switches); `connectInspector()` for the Stately Inspector; and
  `@switchyard-ts/skills`. `interfaceToMermaid` takes method signatures. `spawn` notifies.
