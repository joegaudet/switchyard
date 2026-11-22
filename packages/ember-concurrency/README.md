# @switchyard-ts/ember-concurrency

Run [ember-concurrency](https://ember-concurrency.com) tasks from a Switchyard `@invoke`.
Leaving the state, or stopping the machine, cancels the task instance.

```ts
import { invoke, Machine, transition } from '@switchyard-ts/core'
import { perform } from '@switchyard-ts/ember-concurrency'
import { task, timeout } from 'ember-concurrency'

class Search extends Machine<SearchState> {
  lookup = task(async (q: string) => {
    await timeout(400)
    this.results = await api.search(q)
  })

  @transition({ to: SearchState.Searching, reenter: true })
  type(q: string) {
    this.query = q
  }

  @invoke(SearchState.Searching, { onDone: SearchState.Results, onError: SearchState.Failed })
  load(signal: AbortSignal) {
    return perform(signal, this.lookup, this.query)
  }
}
```

- The task finishing takes `onDone`; throwing takes `onError`.
- Leaving the state, re-entering it, or stopping the machine cancels the instance.
- A task cancelled from outside while the state is active (`cancelAll()`, a restartable task
  performed again) takes `onError`.
- With `@switchyard-ts/ember` imported, `await settled()` waits for the task, including plain
  promises it awaits.

ember-concurrency's async-arrow tasks need its Babel transform,
`'ember-concurrency/async-arrow-task-transform'`, in your app's Babel plugins.

Guide: https://joegaudet.com/switchyard/guide/#/ember-concurrency
