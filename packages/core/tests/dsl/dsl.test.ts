import { afterEach, describe, expect, it, vi } from 'vitest'
import * as standard from './machines.standard.js'

// A non-literal specifier, so TypeScript does not pull the legacy fixture into this
// (standard-decorator) project; tsconfig.legacy.json typechecks it under legacy rules.
const legacyFixtures = './machines.legacy.js'
const legacy = (await import(/* @vite-ignore */ legacyFixtures)) as typeof standard

afterEach(() => void vi.restoreAllMocks())

describe.each([
  ['standard decorators', standard],
  ['legacy decorators', legacy],
])(
  '%s',
  (
    _mode,
    {
      Attempt,
      Chain,
      Counter,
      Editor,
      Fetch,
      FetchState,
      Level,
      Step,
      StrictFetch,
      Toggle,
      ...rest
    },
  ) => {
    describe('a machine class', () => {
      it('starts lazily in the first state of its enum', () => {
        const m = new Fetch()
        expect(m.status).toBe('idle')
        expect(m.state).toBe(FetchState.Idle)
        expect(m.status).toBe('active')
        expect(m.state.isLoading).toBe(false)
      })

      it('calling an event method takes the transition and runs its body with the arguments', () => {
        const m = new Fetch()
        m.fetch()
        expect(m.state).toBe(FetchState.Loading)
        m.resolve('data')
        expect(m.state).toBe(FetchState.Done)
        expect(m.data).toBe('data')
      })

      it('runs @onEntry and @onExit for the decorated state', () => {
        const m = new Fetch()
        m.fetch()
        m.resolve('x')
        expect(m.log).toEqual(['fetch', 'enter loading', 'exit loading'])
      })

      it('matches child states of a compound state', () => {
        const m = new Fetch()
        m.fetch()
        expect(m.matches(FetchState.Loading)).toBe(true)
        expect(m.matches(Attempt.First)).toBe(true)
        m.stall()
        expect(m.matches(Attempt.Retrying)).toBe(true)
        expect(m.matches(Attempt.First)).toBe(false)
      })

      it('history(S) resumes where the compound state was left', () => {
        const m = new Fetch()
        m.fetch()
        m.stall()
        m.reject()
        expect(m.state).toBe(FetchState.Failed)
        m.retry()
        expect(m.matches(Attempt.Retrying)).toBe(true)
      })

      it('stacked @transition decorators give one event several sources', () => {
        const m = new Fetch()
        m.fetch()
        m.resolve('x')
        m.retry()
        expect(m.state).toBe(FetchState.Idle)
      })

      it('a guard names a getter, and and/not combine them', () => {
        const m = new Fetch()
        m.fetch()
        m.reject()
        m.online = false
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        m.retry()
        expect(m.state).toBe(FetchState.Failed)
        m.online = true
        m.retries = 2
        m.retry()
        expect(m.state).toBe(FetchState.Failed)
        m.giveUp()
        expect(m.state).toBe(FetchState.Idle)
      })

      it('a transition with no `from` is handled in every state', () => {
        const m = new Fetch()
        m.fetch()
        m.reset()
        expect(m.state).toBe(FetchState.Idle)
      })

      it('can.<event> says whether the event would be handled now, guards included', () => {
        const m = new Fetch()
        expect(m.can.fetch).toBe(true)
        expect(m.can.resolve).toBe(false)
        m.fetch()
        m.reject()
        m.retries = 2
        expect(m.can.retry).toBe(false)
        expect(m.can.giveUp).toBe(true)
      })

      it('send(name, ...args) is the escape hatch', () => {
        const m = new Fetch()
        m.send('fetch')
        m.send('resolve', 'sent')
        expect(m.data).toBe('sent')
      })

      it('an event method called inside an action is queued, not run re-entrantly', () => {
        const m = new Chain()
        m.go()
        expect(m.log).toEqual(['go', 'next'])
        expect(m.state).toBe(Step.C)
      })

      it('@always transitions run once their guard holds', () => {
        const m = new Counter()
        m.inc()
        expect(m.state).toBe(Level.Low)
        m.inc()
        expect(m.state).toBe(Level.High)
        expect(m.log).toEqual(['promoted'])
      })

      it('notifies subscribers after each event', () => {
        const m = new Fetch()
        const seen: unknown[] = []
        m.subscribe(() => void seen.push(m.state))
        m.fetch()
        m.resolve('x')
        expect(seen).toEqual([FetchState.Idle, FetchState.Loading, FetchState.Done])
      })
    })

    describe('warnings and errors', () => {
      it('warns about an event the current state does not handle', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const m = new Fetch()
        m.resolve('early')
        expect(m.state).toBe(FetchState.Idle)
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Fetch.*"resolve".*idle/))
      })

      it('static strict = true throws on an unhandled event instead', () => {
        const m = new StrictFetch()
        expect(() => m.resolve('early')).toThrow(/StrictFetch.*"resolve"/)
      })

      it('warns when an event body is async', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        new Fetch().ping()
        expect(warn).toHaveBeenCalledWith(expect.stringMatching(/"ping".*@invoke/))
      })

      it('rejects a guard that names no getter', () => {
        expect(() => rest.badGuard().state).toThrow(/guard "nope"/)
      })

      it('rejects a state that is ambiguous between regions', () => {
        expect(() => rest.ambiguousRegion().state).toThrow(/Toggle.off.*bold.*italic/)
      })
    })

    describe('parallel regions', () => {
      it('each @region field holds its region’s state', () => {
        const m = new Editor()
        expect(m.state).toEqual({ bold: Toggle.Off, italic: Toggle.Off })
        m.toggleBold()
        expect(m.bold).toBe(Toggle.On)
        expect(m.italic).toBe(Toggle.Off)
        m.italicize()
        m.toggleBold()
        expect(m.state).toEqual({ bold: Toggle.Off, italic: Toggle.On })
      })
    })

    describe('toConfig()', () => {
      it('compiles the class to the interpreter config', () => {
        const config = Fetch.toConfig()
        expect(Object.keys(config.states ?? {})).toEqual(['idle', 'loading', 'done', 'failed'])
        expect(Object.keys(config.states?.['loading']?.states ?? {})).toEqual([
          'first',
          'retrying',
          '$history',
        ])
        expect(Object.keys(config.states?.['failed']?.on ?? {})).toEqual(['retry', 'giveUp'])
        expect(Editor.toConfig().type).toBe('parallel')
      })
    })
  },
)
