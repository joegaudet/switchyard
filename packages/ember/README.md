# @switchyard-ts/ember

Switchyard statecharts in Ember. Importing the package wires in four things:

- **Tracking.** Templates re-render when a machine transitions. `state`, `matches`, `can` and
  `status` are all tracked, and context is your own `@tracked` fields.
- **Lifetimes.** `machine(owner, instance)` starts a machine and stops it, with its timers and
  actors, when the owner is destroyed.
- **Test waiters.** `await settled()` waits for `@invoke` promises and `@after` timers. A long
  `@after` holds `settled()` for that long; give such machines a `manualClock()` in tests.
- **Template helpers.** `send`, `matches` and `can`.

```gts
import Component from '@glimmer/component'
import { on } from '@ember/modifier'
import { machine, send, can } from '@switchyard-ts/ember'
import { Fetch, FetchState } from './fetch'

export default class UserCard extends Component {
  fetch = machine(this, new Fetch())

  <template>
    {{#if this.fetch.state.isLoading}}Loading…{{/if}}
    <button
      disabled={{if (can this.fetch FetchState.Loading via=this.fetch.retry) false true}}
      {{on 'click' (send this.fetch 'retry')}}
    >Retry</button>
  </template>
}
```

On a service, the machine is shared by every component that injects the service:

```ts
export default class AuthService extends Service {
  session = machine(this, new Session())
}
```

With [ember-resources](https://github.com/NullVoxPopuli/ember-resources) installed, a machine
can live in a template block:

```gts
import { machineResource } from '@switchyard-ts/ember/resource'

<template>
  {{#let (machineResource Fetch) as |fetch|}}…{{/let}}
</template>
```

Requires `ember-source >= 6.12`.
