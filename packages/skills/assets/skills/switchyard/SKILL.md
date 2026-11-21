---
name: switchyard
description: Write, change and test Switchyard statecharts (Machine classes with real-enums states and decorated transitions). Use when adding or editing a machine, its states, events, guards, timers or invoked work, or its tests.
---

# Switchyard

A machine is a class. Its states are real-enums `State` values, its events are decorated
methods, its context is plain (in Ember, `@tracked`) fields. It runs on SCXML semantics:
one event at a time, to completion.

Full guide: https://joegaudet.com/switchyard/guide/

## States

```ts
class Attempt extends State {
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

class FetchState extends State {
  static Idle = FetchState.of('idle') // the first member is the initial state
  static Loading = FetchState.of('loading', { children: Attempt, history: 'shallow' })
  static Failed = FetchState.of('failed')
  static Done = FetchState.of('done')

  @is() accessor isLoading!: boolean // Ember (legacy decorators): `@is() declare isLoading: boolean`
}
```

- A compound state names its child enum with `children`. Each level is its own enum.
- `history: 'shallow' | 'deep'` on a compound state; target it with `history(FetchState.Loading)`.
- State values must not contain `.`.

## Events, guards, actions

```ts
class Fetch extends Machine<FetchState> {
  @tracked retries = 0

  get hasRetriesLeft() {
    return this.retries < 3
  }

  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch(url: string) {} // calling m.fetch(url) sends the event; the body is the transition's action

  @transition({ from: FetchState.Failed, to: history(FetchState.Loading), guard: 'hasRetriesLeft' })
  @transition({ from: FetchState.Done, to: FetchState.Idle }) // stacked: one event, several sources
  retry() {
    this.retries++
  }

  @invoke(FetchState.Loading, { onDone: FetchState.Done, onError: FetchState.Failed })
  async load(signal: AbortSignal) {} // runs while Loading is active; signal aborts on exit

  @after(10_000, { from: FetchState.Loading, to: FetchState.Failed })
  timeout() {}
}
```

- **Event bodies are synchronous.** Async work goes in `@invoke` (or is started from `@onEntry`).
  A body that returns a promise warns in development.
- Calling another event method inside a body **queues** it; it runs after the current event.
- `guard` names a getter (or field/method) of the class. Combine with `and()`, `or()`, `not()`.
- No `from`: the transition is handled in every state. No `to`: the body runs, nothing exits.
- `@onEntry(S)`, `@onExit(S)`, `@always({ from, to, guard })` (eventless), `@region(E) accessor x!: E`
  for parallel regions (the root becomes parallel; `m.state` is `{ x: E.Value, … }`). A state
  enum shared by two regions needs `{ in: 'regionName' }` on decorators that use it.
- Regions inside one state: `S.of('editing', { regions: { bold: Toggle } })`, addressed with
  `{ in: 'editing.bold' }`.
- A method may not be named after Machine's own members (`stop`, `send`, `state`, …); name the
  event apart: `@transition({ event: 'stop', … }) onStop() {}`. Also for dotted event names.
- `@after('getterName', …)` reads the delay from a getter on entry.
- An unhandled event is a no-op with a development warning; `static strict = true` throws.

## Reading a machine

`m.state` (the root value), `m.matches(State.X)` (any depth), `m.can.retry`, `m.status`,
`m.snapshot()` / `m.restore(snapshot)`, `m.subscribe(fn)`, `m.actors`, `m.spawn(child, { id })`,
`m.sendTo(id, event)`, `this.sendParent(event)`, `this.emit(type, payload)` / `m.on(type, fn)`,
`await waitFor(m, pred, { timeout })`, `await toPromise(m)`.

## Ember

Import `@switchyard/ember` once (it wires tracking and test waiters). Then
`fetch = machine(this, new Fetch())` in a component or service (stopped on destroy), and in
templates `{{on "click" (send this.fetch "retry")}}`, `(matches this.fetch FetchState.Done)`,
`(can this.fetch "retry")`. `<SwitchyardDebug @machine={{this.fetch}} />` from
`@switchyard/ember/debug` shows the live chart.

## Testing

- `@after` in tests: `const clock = useManualClock(Fetch)` (from `@switchyard/test`), then
  `clock.advance(ms)`. In Ember tests `await settled()` waits for invokes and timers.
- Assert with `expect(m).toBeIn(State.X)` after `expect.extend(matchers)`, or QUnit's
  `assert.machineIn(m, State.X)` after `setupMachineAssertions(assert)`.
- `coverage(Fetch)` + `track(m)` reports states and transitions no test reached.
- Model-based tests (`@switchyard/harnessed`): `modelTests({ machine, events, states })` gives
  one test per path; drive events and check states through a harness.

## Before finishing

- `npx switchyard diagram src/fetch.ts` (add `--legacy` for Ember sources) and read the chart:
  unreachable states and missing transitions show up at a glance.
- Lint with `@switchyard/eslint-plugin` (`configs.recommended`): unreachable states, unknown
  guards, non-exhaustive `switch (m.state)`.
