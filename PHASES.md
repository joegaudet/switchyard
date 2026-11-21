# Phase specs

The /kickoff output for every phase, written up front so each phase can start without a
question round. Decisions live in [SWITCHYARD_PLAN.md](SWITCHYARD_PLAN.md); this file holds
what each PR must prove. `scripts/kickoff.sh` reads the sections below by their
`## Phase N` heading and the branch slug in the `Branch:` line.

Every phase: TDD (test red first), dual-mode decorator tests where decorators change, the full
gate green (`pnpm format:check && pnpm build && pnpm lint && pnpm typecheck && pnpm test`),
a changeset for published packages, and one draft PR stacked on the previous phase.

## Phase 1: Interpreter core

Branch: `feature/joe/p1-interpreter`

Goal: an SCXML interpreter over a plain-data machine config, with no decorators involved.

Acceptance:

- `createInterpreter(config)` builds a state tree from a nested config (`states`, `initial`,
  `type: 'parallel' | 'final' | 'history'`, `on`, `always`, `entry`, `exit`) and `start()`s it.
- Targets are absolute dotted paths (`'loading.retrying'`).
- Run-to-completion: `send()` called from an action queues externally. `raise()` queues
  internally and is drained before the next external event.
- Transition selection: atomic states in document order, the innermost matching transition
  wins, guards are checked, and the descendant source preempts conflicting transitions.
- Exit runs in reverse document order and entry in document order. The transition domain is
  the LCCA, or the source for a non-reentering transition to a descendant. Targetless
  transitions exit nothing.
- Event descriptors match SCXML-style token prefixes (`error` matches `error.execution`)
  plus `*`.
- Eventless transitions run until stable.
- Final states raise `done.state.<parent>`. A parallel state is done when every region is
  done. A final child of the root stops the machine with `status: 'done'`.
- Shallow and deep history work, with a default target that falls back to the parent's
  initial state.
- An action that throws raises `error.execution` and the machine keeps running.
- `configuration`, `matches(path)`, `status` and `subscribe(fn)` (called after each
  macrostep) are available.
- `conformance/` holds the semantics suite, ported from W3C SCXML IRP and xstate cases, run
  by `pnpm test`.

Non-goals: delays, invoke, actors, context, decorators.

## Phase 2: Decorator DSL

Branch: `feature/joe/p2-decorator-dsl`

Goal: `class X extends Machine<S>` compiles to the Phase 1 config.

Acceptance:

- `@transition({ from, to, guard, reenter })` on a method makes it an event. Calling it sends
  the event, the method body runs as the transition action with the call's arguments, and
  stacked decorators on one method are allowed.
- Source order is document order for conflict resolution.
- A guard names a getter (`guard: 'hasRetriesLeft'`). `and/or/not` combinators exist. An
  unknown name throws when the class is defined.
- `@onEntry(S)`, `@onExit(S)`, `@always({ from, to, guard })`, and `@region` accessor fields
  for parallel regions work.
- Child enums come from `State.of(v, { children })`, and history targets come from
  `S.X.history`.
- An event method called inside an action enqueues; it doesn't recurse. An event body that
  returns a promise warns in dev.
- An unhandled event is a no-op that warns in dev, and `static strict = true` makes it throw.
- `m.state` (per-region record for parallel machines), `m.matches(S.X)`, `m.can.event`, and
  `Machine.toConfig()` are available.
- The registry is a `WeakMap` keyed by constructor, and every decorator is tested in standard
  and legacy modes.
- real-enums minors are only for gaps found here, each one a separate PR in that repo.

## Phase 3: Actors and system

Branch: `feature/joe/p3-actors`

Acceptance:

- `@after(ms, { from, to })` runs on an injectable clock (`createMachine(X, { clock })`) and
  is cancelled on exit.
- `@invoke(S, { onDone, onError })` on an async method gets an `AbortSignal` that aborts on
  exit. A late resolve after exit is ignored.
- Promise, callback and observable actors, `this.spawn(Child)`, `sendTo`, `sendParent`, child
  done with `output`, and `systemId` lookup are supported.
- `emit()` delivers to outside `on(type, fn)` listeners.
- `inspect(fn)` streams `@xstate.event`, `@xstate.snapshot`, `@xstate.actor` and
  `@xstate.microstep` events.

## Phase 4: `@switchyard/ember`

Branch: `feature/joe/p4-ember`

Acceptance:

- A v2 addon at `ember-source >= 6.12` with Glint types.
- State and context are tracked: templates re-render on transition.
- `machine(owner, X)` ties the machine to the destroyable tree, and destroying the owner
  stops it and aborts invokes.
- An ember-resources resource, helpers `send`, `matches` and `can`, and service singletons.
- `settled()` waits for pending invokes and `after` timers through test waiters.
- `test-app/` covers each of these in QUnit.
- Publishing 0.x is unblocked after this phase.

## Phase 5: Persistence

Branch: `feature/joe/p5-persistence`

Acceptance: `snapshot()`/`restore()` round-trip a machine (enum values through codecs,
including history and parallel), a Standard Schema validates restores, query-param sync works,
and `@switchyard/warp-drive` keeps a record attribute in step with a machine.

## Phase 6: Diagrams

Branch: `feature/joe/p6-diagrams`

Acceptance:

- `toGraph()` covers states, regions, transitions with `event [guard] / action`, invokes and
  actors.
- Mermaid `stateDiagram-v2`, DOT and ELK→SVG renderers are snapshot-tested.
- There's an interface view (events, context and guards) and an actor topology view.
- `@switchyard/viewer` provides an interactive web component that highlights the live
  state, plus `<SwitchyardDebug>`.

## Phase 7: Interop

Branch: `feature/joe/p7-interop`

Acceptance: export to xstate JSON that Stately accepts, codegen from an xstate config to a
decorated class, and SCXML import and export, round-tripped through `conformance/`.

## Phase 8: Testing kit

Branch: `feature/joe/p8-testing`

Acceptance:

- `@switchyard/test` provides the clock `advance(ms)`, `assert.machineIn` and vitest
  matchers, a transition-coverage report, and shortest/simple path generation.
- `@switchyard/harnessed` runs model-based tests through harnessed.

## Phase 9: Tooling

Branch: `feature/joe/p9-tooling`

Acceptance:

- `@switchyard/inspector` speaks the Stately inspect protocol and provides an Ember
  Inspector tab.
- The ESLint plugin flags unreachable states, undeclared targets and non-exhaustive matches.
- The `switchyard` CLI provides `diagram`, `export`, `import` and `coverage`.
- The Vite plugin and the skills package are in place.

## Phase 10: Site and guide

Branch: `docs/joe/p10-site`

Acceptance:

- The landing page lives in `docs/site/`, and the `docs-app/` guide has a live example and a
  live diagram on every page.
- The four flagship demos are built.
- The site has comparison and migration pages, a11y guidance, site i18n, the family theme, a
  social card, `llms.txt` and `pages.yml`.

## Phase 11: 1.0

Branch: `chore/joe/p11-one-oh`

Acceptance: the conformance suite and the xstate feature matrix are fully green, and
`release.yml` and trusted publishing are in place.

## Phase 12: Ecosystem

Branch: `feature/joe/p12-ecosystem`

Acceptance: cross-link nav in real-enums, formwright, harnessed and joinery. Formwright's
submit lifecycle runs on switchyard. Each project has a "with switchyard" guide page.
Joinery's primitives come after Joinery 1.0. Each item is a branch in its own repo; this
phase tracks them.
