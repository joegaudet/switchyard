import { module, test } from 'qunit'
import { setupTest } from 'ember-qunit'
import { settled } from '@ember/test-helpers'
import { tracked } from '@glimmer/tracking'
import { task } from 'ember-concurrency'
import { invoke, Machine, State, transition } from '@switchyard-ts/core'
import { perform } from '@switchyard-ts/ember-concurrency'
import '@switchyard-ts/ember'

class SearchState extends State {
  private declare readonly brand: never
  static Idle = SearchState.of('idle')
  static Loading = SearchState.of('loading')
  static Done = SearchState.of('done')
  static Failed = SearchState.of('failed')
}

class Search extends Machine<SearchState> {
  @tracked query = ''
  @tracked result?: string

  lookup = task(async (q: string) => {
    // A plain promise, not ember-concurrency's timeout(), which has its own test waiter.
    await new Promise(resolve => setTimeout(resolve, 20))
    if (q === 'boom') throw new Error('boom')
    this.result = q.toUpperCase()
  })

  @transition({ from: SearchState.Idle, to: SearchState.Loading })
  search(q: string) {
    this.query = q
  }

  @transition({ from: SearchState.Loading, to: SearchState.Loading, reenter: true })
  refine(q: string) {
    this.query = q
  }

  @transition({ from: SearchState.Loading, to: SearchState.Idle })
  clear() {}

  @invoke(SearchState.Loading, { onDone: SearchState.Done, onError: SearchState.Failed })
  load(signal: AbortSignal) {
    return perform(signal, this.lookup, this.query)
  }
}

module('Integration | ember-concurrency', function (hooks) {
  setupTest(hooks)

  test('a finished task takes onDone, and settled() waits for it', async function (assert) {
    const search = new Search().start()
    search.search('ember')
    await settled()
    assert.true(search.matches(SearchState.Done))
    assert.strictEqual(search.result, 'EMBER')
  })

  test('a task that throws takes onError', async function (assert) {
    const search = new Search().start()
    search.search('boom')
    await settled()
    assert.true(search.matches(SearchState.Failed))
  })

  test('leaving the state cancels the task', async function (assert) {
    const search = new Search().start()
    search.search('ember')
    const instance = search.lookup.last!
    search.clear()
    await settled()
    assert.true(instance.isCanceled)
    assert.true(search.matches(SearchState.Idle))
    assert.strictEqual(search.result, undefined)
  })

  test('stopping the machine cancels the task', async function (assert) {
    const search = new Search().start()
    search.search('ember')
    const instance = search.lookup.last!
    search.stop()
    await settled()
    assert.true(instance.isCanceled)
    assert.strictEqual(search.result, undefined)
  })

  test('re-entering the state cancels the old task and performs a new one', async function (assert) {
    const search = new Search().start()
    search.search('emb')
    const first = search.lookup.last!
    search.refine('ember')
    await settled()
    assert.true(first.isCanceled)
    assert.true(search.matches(SearchState.Done))
    assert.strictEqual(search.result, 'EMBER')
  })

  test('a task cancelled from outside, while the state is active, takes onError', async function (assert) {
    const search = new Search().start()
    search.search('ember')
    void search.lookup.cancelAll()
    await settled()
    assert.true(search.matches(SearchState.Failed))
  })
})
