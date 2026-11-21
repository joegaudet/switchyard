// @vitest-environment jsdom
import { ByRole, ByTestId, ComponentHarness, Harness, testId, type Query } from '@harnessed-ts/core'
import { dom } from '@harnessed-ts/dom'
import userEvent from '@testing-library/user-event'
import { Machine, State, transition } from '@switchyard/core'
import { describe, expect, it } from 'vitest'
import { modelTests } from '../src/index.js'

class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading')
  static Done = FetchState.of('done')
  static Failed = FetchState.of('failed')
  static Retrying = FetchState.of('retrying')
}

class Fetch extends Machine<FetchState> {
  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {}

  @transition({ from: [FetchState.Loading, FetchState.Retrying], to: FetchState.Done })
  resolve() {}

  @transition({ from: FetchState.Loading, to: FetchState.Failed })
  reject() {}

  @transition({ from: FetchState.Failed, to: FetchState.Retrying })
  retry() {}
}

/** A plain-DOM UI over a machine. `broken` leaves the Retry button unwired. */
function mount(machine: Fetch, { broken = false } = {}) {
  document.body.innerHTML = `
    <section data-testid="fetcher">
      <p data-testid="status"></p>
      <button>Fetch</button><button>Resolve</button><button>Reject</button><button>Retry</button>
    </section>`
  const status = document.querySelector('[data-testid=status]')!
  const render = () => void (status.textContent = machine.state.value)
  for (const button of document.querySelectorAll('button')) {
    const event = button.textContent!.toLowerCase() as 'fetch' | 'resolve' | 'reject' | 'retry'
    if (broken && event === 'retry') continue
    button.addEventListener('click', () => machine[event]())
  }
  machine.subscribe(render)
}

@Harness({ host: testId('fetcher') })
class FetcherHarness extends ComponentHarness {
  @ByRole('button', { name: 'Fetch' }) private accessor fetchButton!: Query
  @ByRole('button', { name: 'Resolve' }) private accessor resolveButton!: Query
  @ByRole('button', { name: 'Reject' }) private accessor rejectButton!: Query
  @ByRole('button', { name: 'Retry' }) private accessor retryButton!: Query
  @ByTestId('status') private accessor statusLine!: Query

  fetch = () => this.fetchButton.click()
  resolve = () => this.resolveButton.click()
  reject = () => this.rejectButton.click()
  retry = () => this.retryButton.click()
  status = () => this.statusLine.text()
}

const shows = (text: string) => async (h: FetcherHarness) => expect(await h.status()).toBe(text)

const model = {
  machine: () => new Fetch(),
  events: {
    fetch: (h: FetcherHarness) => h.fetch(),
    resolve: (h: FetcherHarness) => h.resolve(),
    reject: (h: FetcherHarness) => h.reject(),
    retry: (h: FetcherHarness) => h.retry(),
  },
  states: {
    idle: shows('idle'),
    loading: shows('loading'),
    done: shows('done'),
    failed: shows('failed'),
    retrying: shows('retrying'),
  },
}

const harness = (opts?: { broken?: boolean }) => {
  mount(new Fetch(), opts)
  return new FetcherHarness(dom({ user: userEvent.setup() }))
}

describe('modelTests', () => {
  const tests = modelTests(model)

  it('makes one test per path, named for its events', () => {
    expect(tests.map(t => t.name)).toEqual([
      'idle',
      'fetch → loading',
      'fetch → resolve → done',
      'fetch → reject → failed',
      'fetch → reject → retry → retrying',
    ])
  })

  for (const t of tests) it(`drives the UI: ${t.name}`, () => t.run(harness()))

  it('simple paths cover every way through, retry included', () => {
    expect(modelTests({ ...model, paths: 'simple' }).map(t => t.name)).toContain(
      'fetch → reject → retry → resolve → done',
    )
  })

  it('fails when the UI does not do what the model does', async () => {
    const retry = tests.find(t => t.name === 'fetch → reject → retry → retrying')!
    await expect(retry.run(harness({ broken: true }))).rejects.toThrow(
      /after fetch → reject → retry, expected retrying: .*expected 'failed' to be 'retrying'/,
    )
  })

  it('requires a driver for every event and a check for every state reached', () => {
    const { resolve: _r, ...events } = model.events
    expect(() => modelTests({ ...model, events })).toThrow(/no driver for event "resolve"/)
    const { failed: _f, ...states } = model.states
    expect(() => modelTests({ ...model, states })).toThrow(/no check for state "failed"/)
  })
})
