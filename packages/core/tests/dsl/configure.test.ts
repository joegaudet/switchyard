// configure(): the seams a framework adapter (@switchyard/ember) plugs into.
import { afterEach, describe, expect, it } from 'vitest'
import { configure, manualClock, type Configuration } from '../../src/index.js'
import { Fetch, FetchState, Job, Worker } from './machines.standard.js'

const reset: Configuration = { reactivity: undefined, clock: undefined, track: undefined }
afterEach(() => configure(reset))

describe('configure', () => {
  it('reactivity: reads consume the machine, and each transition dirties it', () => {
    const log: string[] = []
    configure({
      reactivity: {
        consume: m => void log.push(`consume ${(m as Fetch).constructor.name}`),
        dirty: m => void log.push(`dirty ${(m as Fetch).constructor.name}`),
      },
    })
    const m = new Fetch()
    m.start()
    log.length = 0
    expect(m.state).toBe(FetchState.Idle)
    expect(log).toEqual(['consume Fetch'])
    m.fetch()
    expect(log).toEqual(['consume Fetch', 'dirty Fetch'])
    void m.matches(FetchState.Idle)
    void m.can.fetch
    void m.status
    expect(log.filter(l => l.startsWith('consume'))).toHaveLength(4)
  })

  it('clock: the default for machines without a static clock', () => {
    const clock = manualClock()
    configure({ clock })
    class Plain extends Worker {}
    // Worker pins a manual clock of its own; this subclass falls back to the configured one.
    Object.defineProperty(Plain, 'clock', { value: undefined })
    const m = new Plain()
    m.begin()
    clock.advance(1000)
    expect(m.state).toBe(Job.TimedOut)
  })

  it('track: sees the promise of every @invoke', async () => {
    const tracked: Promise<unknown>[] = []
    configure({ track: p => (tracked.push(p), p) })
    const m = new Worker()
    m.begin()
    expect(tracked).toHaveLength(1)
    m.settle!.resolve('ok')
    await tracked[0]
    expect(m.state).toBe(Job.Done)
  })
})

describe('configure({ messages })', () => {
  it('replaces the text of warnings and the strict error', async () => {
    const { StrictFetch } = await import('./machines.standard.js')
    const { vi } = await import('vitest')
    configure({
      messages: {
        unhandled: (machine, event, state) => `${machine} : « ${event} » refusé dans ${state}`,
        asyncEvent: (machine, event) => `${machine} : « ${event} » est asynchrone`,
      },
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    new Fetch().resolve('x')
    expect(warn).toHaveBeenCalledWith('Fetch : « resolve » refusé dans idle')
    new Fetch().ping()
    expect(warn).toHaveBeenCalledWith('Fetch : « ping » est asynchrone')
    expect(() => new StrictFetch().resolve('x')).toThrow(
      'StrictFetch : « resolve » refusé dans idle',
    )
    warn.mockRestore()
    configure({ messages: undefined })
  })
})

describe('reserved names', () => {
  it('a decorated method may not shadow the Machine API', async () => {
    const { Machine, State, after, transition } = await import('../../src/index.js')
    class S extends State {
      static A = S.of('a')
      static B = S.of('b')
    }
    class Bad extends Machine<S> {
      @after(10, { from: S.A, to: S.B })
      override stop() {
        return this
      }
    }
    expect(() => new Bad().state).toThrow(
      /Bad: "stop" is part of the Machine API; rename the decorated method/,
    )
    class AlsoBad extends Machine<S> {
      @transition({ from: S.A, to: S.B })
      override send() {}
    }
    expect(() => new AlsoBad().status).not.toThrow() // status does not compile
    expect(() => AlsoBad.toConfig()).toThrow(/"send" is part of the Machine API/)
  })
})

describe('parallel machines', () => {
  it('a transition with no `from` stays inside its target region', async () => {
    const { Machine, State, region, transition } = await import('../../src/index.js')
    class Toggle extends State {
      static Off = Toggle.of('off')
      static On = Toggle.of('on')
    }
    class Align extends State {
      static Left = Align.of('left')
      static Right = Align.of('right')
    }
    class Format extends Machine<{ bold: Toggle; align: Align }> {
      @region(Toggle) accessor bold!: Toggle
      @region(Align) accessor align!: Align

      @transition({ in: 'bold', from: Toggle.Off, to: Toggle.On })
      embolden() {}

      @transition({ to: Align.Right })
      alignRight() {}
    }
    const m = new Format()
    m.embolden()
    m.alignRight()
    expect(m.state).toEqual({ bold: Toggle.On, align: Align.Right })
  })
})

describe('event names', () => {
  it('`event` names the event when the method name cannot be it', async () => {
    const { Machine, State, transition } = await import('../../src/index.js')
    class P extends State {
      static Playing = P.of('playing')
      static Stopped = P.of('stopped')
    }
    class Player extends Machine<P> {
      @transition({ event: 'stop', from: P.Playing, to: P.Stopped })
      onStop() {}

      @transition({ event: 'media.ended', from: P.Playing, to: P.Stopped })
      ended() {}
    }
    const a = new Player()
    expect(a.can['stop']).toBe(true)
    a.onStop()
    expect(a.state).toBe(P.Stopped)
    const b = new Player()
    b.send('media.ended')
    expect(b.state).toBe(P.Stopped)
    expect(Object.keys(Player.toConfig().states!['playing']!.on!)).toEqual(['stop', 'media.ended'])
  })
})
