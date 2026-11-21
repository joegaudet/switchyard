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

> **Status: pre-0.1.** Only `State` exists so far. The design, and every decision behind it, is in
> [SWITCHYARD_PLAN.md](SWITCHYARD_PLAN.md).

Site and guide (coming): **https://joegaudet.com/switchyard/**

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
