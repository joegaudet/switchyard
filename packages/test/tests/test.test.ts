import { after, history, Machine, State, transition } from '@switchyard/core'
import { describe, expect, it, vi } from 'vitest'
import {
  coverage,
  matchers,
  setupMachineAssertions,
  type SwitchyardMatchers,
  shortestPaths,
  simplePaths,
  useManualClock,
} from '../src/index.js'

class Attempt extends State {
  static First = Attempt.of('first')
  static Retrying = Attempt.of('retrying')
}

class FetchState extends State {
  static Idle = FetchState.of('idle')
  static Loading = FetchState.of('loading', { children: Attempt, history: 'shallow' })
  static Failed = FetchState.of('failed')
  static Done = FetchState.of('done')
  static TimedOut = FetchState.of('timedOut')
}

class Fetch extends Machine<FetchState> {
  retries = 0
  data?: string

  get hasRetriesLeft() {
    return this.retries < 1
  }

  @transition({ from: FetchState.Idle, to: FetchState.Loading })
  fetch() {}

  @transition({ from: Attempt.First, to: Attempt.Retrying })
  stall() {}

  @transition({ from: FetchState.Loading, to: FetchState.Done })
  resolve(data: string) {
    this.data = data
  }

  @transition({ from: FetchState.Loading, to: FetchState.Failed })
  reject() {}

  @transition({ from: FetchState.Failed, to: history(FetchState.Loading), guard: 'hasRetriesLeft' })
  retry() {
    this.retries++
  }

  @after(1000, { from: FetchState.Loading, to: FetchState.TimedOut })
  timeout() {}
}

const show = (p: { state: string[]; steps: { event: string }[] }) =>
  `${p.steps.map(s => s.event).join(' → ') || '(start)'} ⇒ ${p.state.join(',')}`

describe('shortestPaths', () => {
  it('reaches every state by the fewest events, guards and context included', () => {
    const paths = shortestPaths(() => new Fetch(), {
      events: ['fetch', 'stall', { type: 'resolve', args: ['data'] }, 'reject', 'retry'],
    })
    expect(paths.map(show)).toEqual([
      '(start) ⇒ idle',
      'fetch ⇒ loading.first',
      'fetch → stall ⇒ loading.retrying',
      'fetch → resolve ⇒ done',
      'fetch → reject ⇒ failed',
    ])
  })

  it('finds the events itself when none are given', () => {
    const paths = shortestPaths(() => new Fetch())
    expect(paths.map(p => p.state.join(','))).toContain('loading.retrying')
    expect(paths.some(p => p.steps.some(s => s.event === 'timeout'))).toBe(false)
  })
})

describe('simplePaths', () => {
  it('lists every path that does not revisit a state', () => {
    const paths = simplePaths(() => new Fetch(), { events: ['fetch', 'stall', 'reject', 'retry'] })
    expect(paths.filter(p => p.state.join() === 'failed').map(show)).toEqual([
      'fetch → stall → reject ⇒ failed',
      'fetch → reject ⇒ failed',
    ])
    // retry resumes loading.first or loading.retrying, both already on the path: never simple.
    expect(paths.some(p => p.steps.some(s => s.event === 'retry'))).toBe(false)
  })

  it('a key can tell apart states that share a configuration', () => {
    const paths = shortestPaths(() => new Fetch(), {
      events: ['fetch', 'reject', 'retry'],
      key: m => `${m.snapshot().configuration} retries=${(m as Fetch).retries}`,
    })
    expect(paths.map(show)).toContain('fetch → reject → retry ⇒ loading.first')
  })
})

describe('coverage', () => {
  it('reports the states and transitions a run did not reach', () => {
    const cov = coverage(Fetch)
    const m = new Fetch()
    cov.track(m)
    m.fetch()
    m.reject()
    m.retry()
    const report = cov.report()
    expect(report.states.missing).toEqual(['loading.retrying', 'done', 'timedOut'])
    expect(report.transitions.covered).toBe(3)
    expect(report.transitions.missing).toEqual([
      'loading -> done: resolve',
      'loading -> timedOut: after 1000ms / timeout',
      'loading.first -> loading.retrying: stall',
    ])
    expect(String(report)).toMatch(/^states 4\/7, transitions 3\/6/)
  })

  it('counts delayed transitions taken on the clock', () => {
    const clock = useManualClock(Fetch)
    const cov = coverage(Fetch)
    const m = new Fetch()
    cov.track(m)
    m.fetch()
    clock.advance(1000)
    expect(cov.report().transitions.missing).not.toContain(
      'loading -> timedOut: after 1000ms / timeout',
    )
    Fetch.clock = undefined
  })
})

describe('assertions', () => {
  it('toBeIn: a vitest/jest matcher', () => {
    expect.extend(matchers)
    const expectMachine = (m: Fetch) => expect(m) as unknown as SwitchyardMatchers<void>
    const m = new Fetch()
    m.fetch()
    expectMachine(m).toBeIn(Attempt.First)
    expect(() => expectMachine(m).toBeIn(FetchState.Done)).toThrow(
      /expected Fetch to be in done, but it is in loading\.first/,
    )
  })

  it('assert.machineIn: a QUnit assertion', () => {
    const pushResult = vi.fn()
    const assert = setupMachineAssertions({ pushResult })
    const m = new Fetch()
    assert.machineIn(m, FetchState.Idle)
    assert.machineIn(m, FetchState.Done, 'not yet')
    expect(pushResult.mock.calls.map(([r]) => [r.result, r.message])).toEqual([
      [true, 'Fetch is in idle'],
      [false, 'not yet'],
    ])
  })
})
