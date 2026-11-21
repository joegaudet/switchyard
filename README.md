# switchyard

<img src="docs/logo.svg" width="64" height="64" alt="" align="right" />

Statecharts for Ember, written as classes. States are [real-enums](https://joegaudet.com/real-enums/),
transitions are decorated methods, and context is `@tracked` fields. You get the full xstate v5
feature set (hierarchy, parallel regions, history, guards, delays, invoked and spawned actors)
on SCXML semantics, without config objects or hooks.

```ts
class Fetch extends Machine<FetchState> {
  @tracked data?: User

  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {}

  @transition({ from: FetchState.Loading, to: FetchState.Done })
  resolve(data: User) {
    this.data = data
  }
}
```

> **Status: 0.x, ahead of 1.0.** Every phase of [SWITCHYARD_PLAN.md](SWITCHYARD_PLAN.md) is
> built and tested. [PARITY.md](PARITY.md) maps xstate v5's features to Switchyard's, with
> the tests that prove each one. Nothing is published to npm yet; see "Releasing" in
> CONTRIBUTING.

Site and guide, with a live example on every page: **https://joegaudet.com/switchyard/**

| Package                                               | For                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------- |
| [`@switchyard/core`](packages/core)                   | Machines, decorators, the interpreter, snapshots                  |
| [`@switchyard/ember`](packages/ember)                 | Tracking, lifetimes, helpers, test waiters, announcer, debug view |
| [`@switchyard/graph`](packages/graph)                 | Mermaid, DOT, SVG, interface and actor views, live viewer         |
| [`@switchyard/test`](packages/test)                   | Model paths, coverage, matchers, a manual clock                   |
| [`@switchyard/harnessed`](packages/harnessed)         | Model-based tests through harnessed                               |
| [`@switchyard/interop`](packages/interop)             | xstate JSON and SCXML, both ways, and codegen                     |
| [`@switchyard/inspector`](packages/inspector)         | The Stately Inspector                                             |
| [`@switchyard/cli`](packages/cli)                     | `switchyard diagram\|export\|import`, and a Vite plugin           |
| [`@switchyard/eslint-plugin`](packages/eslint-plugin) | Unreachable states, unknown guards, non-exhaustive switches       |
| [`@switchyard/skills`](packages/skills)               | The authoring skill for coding agents                             |

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
