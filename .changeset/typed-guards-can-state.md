---
'@switchyard-ts/core': minor
'@switchyard-ts/ember': minor
'@switchyard-ts/interop': minor
'@switchyard-ts/eslint-plugin': minor
---

Guards can point at the getter they read, `guard: (m: Fetch) => m.hasRetriesLeft`, so TypeScript
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
