# xstate v5 parity

1.0 ships when every row below is ✓ or a documented design difference. ✓ rows name the tests
that prove them. Semantics are checked against xstate 5.33 directly: the tests in
`packages/interop/tests/xstate.test.ts` run the same event sequences through xstate and
Switchyard and compare the configuration after every event.

**Legend:**

- ✓: supported and tested
- ≈: supported differently, by design
- ✗: not yet supported

## Semantics

| xstate v5                                                 | Switchyard                               |     | Tests                                              |
| --------------------------------------------------------- | ---------------------------------------- | --- | -------------------------------------------------- |
| Run-to-completion, internal/external queues               | Same algorithm (W3C SCXML Appendix D)    | ✓   | `core/tests/conformance/macrostep.test.ts`         |
| Transition selection, document order, conflict resolution | Same                                     | ✓   | `conformance/selection.test.ts`, `review.test.ts`  |
| Entry/exit order, LCCA, `reenter`                         | Same; `reenter: false` default, as in v5 | ✓   | `conformance/entry-exit.test.ts`                   |
| Event descriptors: exact, `x.*`, `*`                      | Same                                     | ✓   | `conformance/selection.test.ts`                    |
| Eventless (`always`)                                      | `@always`                                | ✓   | `conformance/macrostep.test.ts`, `dsl/dsl.test.ts` |
| Hierarchical states                                       | `State.of(v, { children })`              | ✓   | `dsl/dsl.test.ts`                                  |
| Parallel states (root)                                    | `@region` fields                         | ✓   | `dsl/dsl.test.ts`                                  |
| Parallel states (nested)                                  | `State.of(v, { regions })`               | ✓   | `dsl/parity.test.ts`                               |
| History, shallow and deep, with defaults                  | `history` option, `history(S.X)` target  | ✓   | `conformance/history.test.ts`, `dsl/dsl.test.ts`   |
| Final states, `done.state.*`, nested parallel completion  | Same, through nested parallels           | ✓   | `conformance/macrostep.test.ts`, `review.test.ts`  |
| Errors in actions and guards → `error.execution`          | Same                                     | ✓   | `conformance/macrostep.test.ts`, `review.test.ts`  |

## Machine definition

| xstate v5                                                | Switchyard                                          |     | Tests                                           |
| -------------------------------------------------------- | --------------------------------------------------- | --- | ----------------------------------------------- |
| `createMachine` / `setup` config                         | A decorated class                                   | ≈   | `dsl/dsl.test.ts`                               |
| `context` + `assign`                                     | `@tracked` fields, assigned directly                | ≈   | `dsl/dsl.test.ts`                               |
| Machine `input`                                          | Constructor arguments                               | ≈   | `dsl/dsl.test.ts` (`FileUpload`)                |
| Guards, `and` / `or` / `not`                             | Getter names, same combinators                      | ✓   | `dsl/dsl.test.ts`, `dsl/labels.test.ts`         |
| `stateIn` guard                                          | A getter that reads `this.matches(S.X)`             | ≈   | (any getter guard)                              |
| `after` with fixed delays                                | `@after(ms)`                                        | ✓   | `conformance/actors.test.ts`, `dsl/dsl.test.ts` |
| Named or dynamic delays                                  | `@after('getterName')`, read on entry               | ✓   | `dsl/parity.test.ts`                            |
| `tags`, `meta`, `description`                            | Fields and getters on the `State` enum (real-enums) | ≈   | (real-enums)                                    |
| Event names that are not identifiers                     | `@transition({ event: 'media.ended' })`             | ✓   | `dsl/configure.test.ts`                         |
| `raise` / `sendTo` / `sendParent` with `delay`, `cancel` | `@after` on a state                                 | ≈   | none; ad hoc delayed sends are not planned      |
| `enqueueActions`, `log`                                  | Plain code in the method body                       | ≈   | none                                            |

## Actors and runtime

| xstate v5                                               | Switchyard                                                   |     | Tests                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------ | --- | --------------------------------------------------------- |
| `fromPromise`, `fromCallback`, `fromObservable`         | `@invoke` returning a promise, a cleanup, or a Subscribable  | ✓   | `conformance/actors.test.ts`, `dsl/dsl.test.ts`           |
| Invoked child machines, `onDone` with `output`          | `@invoke` returning a `Machine`; its `output` getter         | ✓   | `conformance/actors.test.ts`, `dsl/dsl.test.ts`           |
| `spawnChild` / `spawn`, `stopChild`                     | `this.spawn()`; children stop with their parent              | ✓   | `dsl/dsl.test.ts`                                         |
| `sendTo`, `sendParent`, `systemId` / `system.get`       | Same names                                                   | ✓   | `dsl/dsl.test.ts`                                         |
| `emit` + `actor.on`                                     | `this.emit` + `m.on`                                         | ✓   | `dsl/dsl.test.ts`                                         |
| `fromTransition`, `fromEventObservable`                 | none                                                         | ✗   | not planned for 1.0: a reducer is a machine here          |
| `actor.getSnapshot`, `snapshot.matches`, `snapshot.can` | `m.state`, `m.matches`, `m.can`                              | ✓   | `dsl/dsl.test.ts`                                         |
| `getPersistedSnapshot` / restore                        | `m.snapshot()` / `m.restore()`, `static persist`, `schema()` | ✓   | `conformance/snapshot.test.ts`, `dsl/persistence.test.ts` |
| `inspect`                                               | `m.inspect()`; the Stately Inspector via `connectInspector`  | ✓   | `conformance/actors.test.ts`, `inspector/tests`           |
| `waitFor`, `toPromise`                                  | Same names                                                   | ✓   | `dsl/parity.test.ts`                                      |
| Pure `transition()` / `getNextSnapshot`                 | none                                                         | ✗   | not planned for 1.0                                       |
| `@xstate/graph` paths, `@xstate/test`                   | `@switchyard/test`, `@switchyard/harnessed`                  | ✓   | `test/tests`, `harnessed/tests`                           |

## What 1.0 waits on

- The ✗ rows are deliberate omissions for 1.0, listed so nobody discovers them by surprise.
- Publishing waits on the `@switchyard` npm org, trusted publishing per package, and the
  release app secrets (see CONTRIBUTING, "Releasing").
