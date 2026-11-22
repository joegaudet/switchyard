# Switchyard: plan

A statechart library for Ember. A machine is a class, its states are
[real-enums](https://github.com/joegaudet/real-enums) values, its events are decorated
methods, and its context is `@tracked` fields. It aims for full xstate v5 parity on SCXML
semantics, without xstate's config-object/hook style. It's the spiritual successor to
ember-statecharts.

Deliverables: this repo (`joegaudet/switchyard`, public, MIT), the `@switchyard-ts/*` packages,
a marketing site and guide at **joegaudet.com/switchyard**, and updates to real-enums,
ember-formwright, harnessed and ember-joinery.

**Name:** switchyard, the rail yard where switches route trains between tracks.
**Icon:** [`docs/logo.svg`](docs/logo.svg) is a geometric rail switch: one track in, two out,
with a node at each end. It uses the same 64×64, rx=14 gradient tile and dark-mode handling as
real-enums, with an indigo accent.

## Decisions (from the 50-question intake, 2026-11-21)

### Scope and parity

| #   | Decision                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Framework-agnostic `@switchyard-ts/core`, plus `@switchyard-ts/ember` for tracking, destroyables, test waiters and helpers                                                                                                                                                                                                         |
| 2   | **Full xstate v5 parity** for 1.0                                                                                                                                                                                                                                                                                                  |
| 3   | Spiritual successor to ember-statecharts; the guide has a migration page                                                                                                                                                                                                                                                           |
| 27  | SCXML run-to-completion semantics (macrosteps and microsteps, internal/external queues, document-order conflict resolution), checked by a conformance suite. Event descriptors follow xstate v5 (exact, `x.*`, `*`), since SCXML's prefix matching makes `done.state.p` match `done.state.p.r1`; SCXML import translates (Phase 1) |
| 28  | Interop: export to xstate JSON, import from xstate configs (codegen to a decorated class), SCXML import and export                                                                                                                                                                                                                 |
| 32  | Code is the source of truth. Diagrams are output only, with no visual editor                                                                                                                                                                                                                                                       |

### DSL

| #   | Decision                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | **The class is the machine.** `class Fetch extends Machine<FetchState>`, with `@transition({ from, to })` on event methods                                                                                                                                            |
| 10  | **Each compound state names a child enum:** `static Loading = FetchState.of('loading', { children: Attempt })`, so every level is exhaustive on its own                                                                                                               |
| 11  | **Methods are events.** `m.fetch(payload)` sends `fetch`, and the method signature types the payload. `m.send('fetch', payload)` is the escape hatch                                                                                                                  |
| 12  | **Dual-mode decorators**, TC39 standard and legacy (decorator-transforms), using the same pattern as real-enums' `@is()`                                                                                                                                              |
| 13  | **Guards name a tracked getter (a computed property):** `guard: 'hasRetriesLeft'` refers to `get hasRetriesLeft()`. Named guards appear as labels in diagrams. Combinators `and/or/not` take names too. Unknown names throw when the machine first compiles (Phase 2) |
| 14  | **Context is `@tracked` fields** that actions mutate directly. There is no `assign()`                                                                                                                                                                                 |
| 15  | Async work is native `async` with an `AbortSignal` that aborts when the owning state exits. No ember-concurrency                                                                                                                                                      |
| 16  | An unhandled event is a no-op with a dev-mode warning. `static strict = true` makes it throw                                                                                                                                                                          |
| 17  | **Parallel regions are `@region` accessor fields:** `@region bold = Toggle`, and `m.state.bold === Toggle.On`                                                                                                                                                         |
| 18  | `@after(ms, { from, to })` uses an injectable clock, and pending timers register Ember test waiters                                                                                                                                                                   |
| 19  | **Machines are actors.** `@invoke(Child)` and `this.spawn(Child)` create them, and `sendTo`, `sendParent`, `onDone` and `onError` work as in xstate. Promise, callback and observable actors are also supported                                                       |
| 20  | Eventless (`always`) transitions, final states with `output`, a `system` registry keyed by `systemId`, and `emit()` for events sent to outside listeners                                                                                                              |
| 21  | History is an option on the compound state (`history: 'shallow' \| 'deep'`), entered by targeting `history(FetchState.Loading)` (Phase 2: `State.history` already holds the option)                                                                                   |

Sketch (illustrative; Phase 2 settles the exact signatures):

```ts
class Attempt extends State {
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading', { children: Attempt, history: 'shallow' })
  static Done = FetchState.of('done', { final: true })
  static Failed = FetchState.of('failed')

  @is() accessor isLoading!: boolean
}

class Fetch extends Machine<FetchState> {
  @tracked data?: User
  @tracked retries = 0

  get hasRetriesLeft() {
    return this.retries < 3
  }

  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {}

  @transition({ from: FetchState.Failed, to: FetchState.Loading, guard: 'hasRetriesLeft' })
  retry() {
    this.retries++
  }

  @invoke(FetchState.Loading, { onDone: FetchState.Done, onError: FetchState.Failed })
  async load(signal: AbortSignal) {
    this.data = await getUser({ signal })
  }

  @after(10_000, { from: FetchState.Loading, to: FetchState.Failed })
  timeout() {}
}
```

### Ember

| #   | Decision                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | The first-class ways to hold a machine are: owned by a component or service (linked to the destroyable tree and stopped on destroy), an ember-resources resource, template helpers (`send`, `matches`, `can`), and service-level singletons |
| 23  | Templates query state through real-enums `@is` (`m.state.isLoading`), `m.matches(State.X)` for ancestors, `m.can.fetch`, and exhaustive `match()`                                                                                           |
| 24  | The Ember floor matches formwright and real-enums: a v2 addon, gjs/gts, Glint, and `ember-source >= 6.12`                                                                                                                                   |

### Persistence, devtools and diagrams

| #   | Decision                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25  | Persistence: `snapshot()`/`restore()` (enums serialized through real-enums codecs), a record attribute or query param bound to a machine's state (`bindField`, Phase 5: one core function covers both, so there is no `@switchyard-ts/warp-drive`), and Standard Schema validation of restored snapshots |
| 26  | Devtools: an `inspect()` event stream, Stately Inspector protocol compatibility, an Ember Inspector tab, and a `<SwitchyardDebug @machine=… />` live-diagram overlay                                                                                                                                     |
| 29  | Diagrams: the statechart (with `event [guard] / action` labels), a class-interface view (events with payload types, context, guards, actions, actors), actor topology, and a live, animated view                                                                                                         |
| 30  | Diagram formats: Mermaid, SVG laid out with ELK, DOT, and an interactive web component                                                                                                                                                                                                                   |
| 31  | Diagrams come from runtime reflection (`Machine.toGraph()` reading decorator metadata) and from a build-time CLI/Vite plugin. The interface view uses the TS compiler API for payload types                                                                                                              |

### Testing and tooling

| #   | Decision                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 33  | Model-based testing built on harnessed: paths through the chart become tests that run under every runner harnessed supports             |
| 34  | Test utilities: fake-clock `advance(ms)`, test waiters, `assert.machineIn` and vitest matchers, and a transition-coverage report        |
| 35  | Tooling: an ESLint plugin, a CLI (`switchyard diagram\|export\|import\|coverage`), a Vite/Embroider plugin, and a Claude skills package |

### Repo, site and release

| #   | Decision                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 36  | Repo template is real-enums: pnpm, changesets, tag-triggered `release.yml`, `scripts/publish.mjs`, and OIDC trusted publishing (works with `/oss-release`)                                               |
| 37  | `github.com/joegaudet/switchyard`, public                                                                                                                                                                |
| 7–8 | The site follows the formwright layout: a hand-written landing page in `docs/site/`, a `docs-app/` Ember guide built into `docs/site/guide/`, and deployment to GitHub Pages at joegaudet.com/switchyard |
| 38  | Release as 0.x previews (so your other projects can dogfood it), then 1.0 once parity is reached and the conformance suite is green                                                                      |
| 39  | Every guide page has a live gjs example with its live diagram beside it                                                                                                                                  |
| 40  | Flagship demos: fetch/retry, a multi-step wizard on formwright, an upload queue with spawned actors, and an auth/session service                                                                         |
| 41  | A side-by-side comparison with xstate and ember-statecharts: the same machine three ways, plus a feature matrix, in a factual tone                                                                       |
| 42  | The shared family theme, with an indigo accent                                                                                                                                                           |
| 43  | Site i18n, localizable library messages, an a11y docs page (announcing state changes, focus on entry), and a11y helpers (announce-on-entry)                                                              |
| 49  | Intake output: this plan, a scaffold, and the GitHub repo                                                                                                                                                |
| 50  | Execution: phased stacked PRs, one per phase, run through `/kickoff` → `/implement` → `/pr`                                                                                                              |

### Ecosystem (Q44–47)

The projects in scope are real-enums, ember-formwright, harnessed and ember-joinery. "Update"
means cross-links, internal adoption, integration packages and a "with switchyard" guide page
in each. real-enums gets **additive minor releases only**. Joinery adopts switchyard
**after its 1.0**, in a 1.x minor.

## Target layout

```
packages/
  core/          @switchyard-ts/core        State, Machine, decorators, interpreter, actors, inspect, snapshot
  ember/         @switchyard-ts/ember       v2 addon: tracking, owner/destroyables, resource, helpers, waiters, services
  graph/         @switchyard-ts/graph       toGraph(), Mermaid, DOT and ELK→SVG; /viewer: the live web component
  interop/       @switchyard-ts/interop     xstate JSON and SCXML import/export, plus the codegen
  test/          @switchyard-ts/test        clock, matchers, coverage, and model-based paths
  harnessed/     @switchyard-ts/harnessed   MBT on harnessed
  inspector/     @switchyard-ts/inspector   the Stately Inspector protocol
  eslint-plugin/ @switchyard-ts/eslint-plugin
  cli/           @switchyard-ts/cli         bin: switchyard; /vite: build-time diagrams
  skills/        @switchyard-ts/skills      Claude skills
docs/site/       hand-written landing page (+ guide/ built from docs-app)
docs-app/        Ember guide app, one live example per feature
test-app/        Ember integration tests and the demo build
conformance/     SCXML/xstate semantics suite (the parity oracle)
```

The scaffold only creates `packages/core`. Each package appears in the phase that builds it.

## Phases (one PR each; main stays green)

### Phase 0: Scaffold (this commit)

The repo, the template config, `ci.yml`, `State` with tests, the icon and this plan.

Open items before anything publishes:

- **The npm scope is `@switchyard-ts`** (changed 2026-11-21: the `@switchyard` org belongs to
  someone else). Unscoped `switchyard` is taken too (an express router from 2022, so there's no
  bare `npx switchyard`; `@switchyard-ts/cli` still provides the `switchyard` bin).
- Add `release.yml` and `bootstrap-publish.yml` from real-enums. Set `RELEASE_APP_CLIENT_ID`
  and `RELEASE_APP_PRIVATE_KEY` on the repo, and set up trusted publishing per package. They
  were left out of the scaffold because the version job fails without the app secrets, which
  would turn main red.

### Phase 1: Interpreter core (no decorators)

An internal, plain-data machine definition (a state tree, transitions, actions and guards as
functions) and an SCXML interpreter that runs it: run-to-completion, microsteps, internal and
external event queues, entry/exit order, the least-common-compound-ancestor rule, conflict
resolution in document order, eventless transitions, final states and `done` events, and
shallow/deep history. Port the relevant xstate v5 test cases and the W3C SCXML IRP tests into
`conformance/` and run them on this layer first. Every later DSL change lands on a green
oracle.

### Phase 2: Decorator DSL

`Machine<S>`, `@transition`, `@onEntry`, `@onExit`, `@after`, `@always`, `@region` and `@invoke`.
Decorators compile into the Phase 1 definition through a registry keyed by the class (see
Risks). Guards are getter names. Every decorator is tested in both decorator modes. This is
also where the **real-enums minor** happens, but only for gaps the prototype actually hits
(`Enum.of(value, ...args)` already carries `StateOptions`).

### Phase 3: Actors and system

Promise, callback and observable actors, `spawn`, `sendTo`, `sendParent`, `systemId`
registry, `emit()`, `onDone` and `onError` with output, `AbortSignal` on state exit, the
injectable clock, and `inspect()`.

### Phase 4: `@switchyard-ts/ember`

Tracked state and context, owner and destroyable integration, the resource, helpers (`send`,
`matches`, `can`), service singletons, test waiters for invoke and `after`, and Glint types.
This phase adds `test-app/`.

### Phase 5: Persistence

`snapshot()`/`restore()` with Standard Schema validation, and `bindField()` for record
attributes (mirror) and query params (accessor).

### Phase 6: Diagrams

`@switchyard-ts/graph`: `toGraph()`; Mermaid, DOT and ELK→SVG for the statechart; the interface
view and actor topology; and `@switchyard-ts/graph/viewer`, the live `<switchyard-diagram>` web
component (folded in from a separate viewer package, since it is a few dozen lines over the
SVG). `<SwitchyardDebug>` is `@switchyard-ts/ember/debug`. Payload types in the interface view
come with the build-time CLI (Phase 9).

### Phase 7: Interop

`@switchyard-ts/interop`: xstate JSON export (so Stately Studio opens our machines), xstate
config → decorated-class codegen, and SCXML import and export, round-tripped through
`conformance/`.

### Phase 8: Testing kit

`@switchyard-ts/test` (clock, matchers, coverage report, path generation) and
`@switchyard-ts/harnessed` (MBT).

### Phase 9: Tooling

`@switchyard-ts/inspector` (`connectInspector()` for the Stately Inspector), the ESLint plugin
(unreachable states, unknown guards, non-exhaustive state switches), `@switchyard-ts/cli`
(`switchyard diagram|export|import`, with payload types read from source) and its Vite plugin
at `@switchyard-ts/cli/vite` (folded in: it is the CLI's renderer behind a query string), and
`@switchyard-ts/skills`. Dropped: an **Ember Inspector tab**, since the inspector has no public
extension point for third-party tabs (emberjs/ember-inspector#321); `<SwitchyardDebug>` and the
Stately Inspector cover live inspection. Deferred: a `coverage` CLI command, which needs reports
serialized from test runs.

### Phase 10: Site and guide

The landing page in `docs/site/` and the `docs-app/` guide, built into `docs/site/guide/`. Every
page has a live example and a live chart. The examples' source is imported `?raw`, so it can't
drift. The four flagship demos, the comparison and migration pages, a11y guidance,
`<SwitchyardAnnouncer>`, localizable library messages (`configure({ messages })`), the social
card, `llms.txt` and `pages.yml` are all here.

**Deferred: site translation.** No site in the family is translated yet, so there is no
pattern to follow. The site is English until one exists. Enum labels become translatable for
free through real-enums' i18n work, because `State` extends `Enum`.

### Phase 11: 0.x → 1.0

Publish 0.x as soon as Phase 4 lands so the ecosystem work can start. 1.0 ships once the
conformance suite and the xstate feature matrix are fully green.

### Phase 12: Ecosystem (each one a branch in its own repo)

1. **All four:** the family cross-link nav and footer, plus README links. This can land
   anytime.
2. **real-enums:** whatever additive minors Phase 2 needs, and a "with switchyard" guide
   page.
3. **ember-formwright:** run the submit/validation lifecycle on switchyard, add a wizard
   integration, and add a guide page.
4. **harnessed:** MBT documentation and examples (the package lives here, as
   `@switchyard-ts/harnessed`).
5. **ember-joinery, after 1.0:** move the stateful primitives (dialog, combobox, menu, tabs)
   onto machines in a 1.x minor.

## Risks and open items

- **Methods as events vs run-to-completion.** The decorator replaces the method with a
  `send()` wrapper, and the original body runs as the transition's action. An event method
  called from inside an action **enqueues** on the internal queue and doesn't recurse. Event
  bodies are synchronous. Async work belongs in `@onEntry` and `@invoke`, and the dev build
  warns if an event body returns a promise.
- **One event, several sources.** `retry` from both Failed and TimedOut means stacking
  `@transition` decorators on one method. Decorators apply bottom-up, so document order for
  conflict resolution is **source order** (recorded by position, not application order) and
  is documented.
- **Reflection in both decorator modes.** Legacy decorators have no `Symbol.metadata`, so
  `toGraph()` reads a `WeakMap` registry keyed by the constructor, the same pattern as
  real-enums' `declared` map. Stage-3 `@region` needs `accessor` fields, and in legacy mode it
  uses a `declare` field.
- **Payload types for the interface view** exist only at compile time, so they need the TS
  compiler API (CLI/Vite) and are absent from the runtime-only `toGraph()`.
- **The shared theme lives in unmerged `wt-*-theme` worktrees.** Phase 10 depends on it
  landing in the other repos first, or on extracting it into a shared package.
- **Stately Inspector protocol** is external and versioned. Pin a version and test against
  it.
- **Full parity is large.** The conformance suite is what decides when 1.0 is done, so scope
  creep shows up as failing tests, not as opinion.
