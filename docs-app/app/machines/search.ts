import { tracked } from '@glimmer/tracking'
import { invoke, Machine, State, transition } from '@switchyard-ts/core'
import { perform } from '@switchyard-ts/ember-concurrency'
import { task, timeout } from 'ember-concurrency'

export class SearchState extends State {
  static Idle = SearchState.of('idle')
  static Searching = SearchState.of('searching')
  static Results = SearchState.of('results')
  static Failed = SearchState.of('failed')
}

const people = ['Ada Lovelace', 'Alan Turing', 'Grace Hopper', 'Edsger Dijkstra', 'Barbara Liskov']

export class Search extends Machine<SearchState> {
  @tracked query = ''
  @tracked results: string[] = []

  // An existing ember-concurrency task: debounces, then "fetches".
  lookup = task(async (q: string) => {
    await timeout(400)
    if (q === 'error') throw new Error('500')
    this.results = people.filter(p => p.toLowerCase().includes(q.toLowerCase()))
  })

  // Each keystroke re-enters Searching, which cancels the running task and starts a new one.
  @transition({ to: SearchState.Searching, reenter: true })
  type(q: string) {
    this.query = q
  }

  @transition({ from: SearchState.Searching, to: SearchState.Idle })
  cancel() {}

  @invoke(SearchState.Searching, { onDone: SearchState.Results, onError: SearchState.Failed })
  load(signal: AbortSignal) {
    return perform(signal, this.lookup, this.query)
  }
}
