// Delayed transitions and invoked actors at the config level. SCXML 6.2 (<send delay>),
// 6.3 (<cancel>), 6.4 (<invoke>: started after the macrostep, cancelled on exit); IRP 236,
// 422, 423, 252; plus xstate v5's promise/callback/observable actors and inspection events.
import { describe, expect, it, vi } from 'vitest'
import { createInterpreter, manualClock, type Interpreter } from '../../src/index.js'

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('after', () => {
  it('transitions once the delay has passed, and not before', () => {
    const clock = manualClock()
    const m = createInterpreter(
      { states: { a: { after: { 1000: { target: 'b' } } }, b: {} } },
      { clock },
    ).start()
    clock.advance(999)
    expect(m.configuration).toEqual(['a'])
    clock.advance(1)
    expect(m.configuration).toEqual(['b'])
  })

  it('is cancelled when its state exits first', () => {
    const clock = manualClock()
    const m = createInterpreter(
      {
        states: {
          a: { after: { 1000: { target: 'late' } }, on: { go: { target: 'b' } } },
          b: { on: { back: { target: 'a' } } },
          late: {},
        },
      },
      { clock },
    ).start()
    clock.advance(500)
    m.send({ type: 'go' })
    clock.advance(1000)
    expect(m.configuration).toEqual(['b'])
    m.send({ type: 'back' })
    clock.advance(999)
    expect(m.configuration).toEqual(['a'])
    clock.advance(1)
    expect(m.configuration).toEqual(['late'])
  })

  it('reports pending timers to the clock until they fire or are cancelled', () => {
    const clock = manualClock()
    const m = createInterpreter(
      { states: { a: { after: { 10: { target: 'b' } } }, b: {} } },
      { clock },
    ).start()
    expect(clock.pending).toBe(1)
    clock.advance(10)
    expect(clock.pending).toBe(0)
    m.stop()
  })
})

describe('invoke', () => {
  it('a promise actor that resolves takes onDone, with its output on the event', async () => {
    const seen: unknown[] = []
    const m = createInterpreter({
      states: {
        loading: {
          invoke: [
            {
              src: async () => 42,
              onDone: { target: 'done', actions: [e => void seen.push(e['output'])] },
            },
          ],
        },
        done: {},
      },
    }).start()
    await flush()
    expect(m.configuration).toEqual(['done'])
    expect(seen).toEqual([42])
  })

  it('a promise actor that rejects takes onError, with the error on the event', async () => {
    const seen: unknown[] = []
    const m = createInterpreter({
      states: {
        loading: {
          invoke: [
            {
              src: async () => {
                throw new Error('nope')
              },
              onError: { target: 'failed', actions: [e => void seen.push(String(e['error']))] },
            },
          ],
        },
        failed: {},
      },
    }).start()
    await flush()
    expect(m.configuration).toEqual(['failed'])
    expect(seen).toEqual(['Error: nope'])
  })

  it('aborts its signal when the state exits, and ignores a late result', async () => {
    let signal!: AbortSignal
    let resolve!: (v: unknown) => void
    const m = createInterpreter({
      states: {
        loading: {
          on: { cancel: { target: 'idle' } },
          invoke: [
            {
              src: ({ signal: s }) => {
                signal = s
                return new Promise(r => (resolve = r))
              },
              onDone: { target: 'done' },
            },
          ],
        },
        idle: {},
        done: {},
      },
    }).start()
    m.send({ type: 'cancel' })
    expect(signal.aborted).toBe(true)
    resolve('late')
    await flush()
    expect(m.configuration).toEqual(['idle'])
  })

  it('is not started for a state entered and left within one macrostep', () => {
    const src = vi.fn(() => () => {})
    createInterpreter({
      states: { a: { invoke: [{ src }], always: [{ target: 'b' }] }, b: {} },
    }).start()
    expect(src).not.toHaveBeenCalled()
  })

  it('a callback actor sends events back, receives sendTo, and is cleaned up on exit', () => {
    const received: unknown[] = []
    const cleanup = vi.fn()
    const m = createInterpreter({
      states: {
        listening: {
          on: {
            ping: { actions: [(_e, { sendTo }) => sendTo('socket', { type: 'hello' })] },
            pong: { target: 'heard' },
          },
          invoke: [
            {
              id: 'socket',
              src: ({ sendBack, receive }) => {
                receive(e => {
                  received.push(e.type)
                  sendBack({ type: 'pong' })
                })
                return cleanup
              },
            },
          ],
        },
        heard: {},
      },
    }).start()
    m.send({ type: 'ping' })
    expect(received).toEqual(['hello'])
    expect(m.configuration).toEqual(['heard'])
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('an observable actor delivers values as snapshot events and completes with done', () => {
    let observer!: { next(v: unknown): void; complete(): void }
    const unsubscribe = vi.fn()
    const values: unknown[] = []
    const m = createInterpreter({
      states: {
        watching: {
          on: { 'xstate.snapshot.ticks': { actions: [e => void values.push(e['snapshot'])] } },
          invoke: [
            {
              id: 'ticks',
              src: () => ({
                subscribe(o: typeof observer) {
                  observer = o
                  return { unsubscribe }
                },
              }),
              onDone: { target: 'finished' },
            },
          ],
        },
        finished: {},
      },
    }).start()
    observer.next(1)
    observer.next(2)
    observer.complete()
    expect(values).toEqual([1, 2])
    expect(m.configuration).toEqual(['finished'])
  })

  it('a child machine runs while its state is active and reports done with its output', () => {
    let child!: Interpreter
    const m = createInterpreter({
      states: {
        parent: {
          on: { poke: { actions: [(_e, { sendTo }) => sendTo('child', { type: 'finish' })] } },
          invoke: [
            {
              id: 'child',
              src: () =>
                (child = createInterpreter({
                  states: {
                    working: { on: { finish: { target: 'end' } } },
                    end: { type: 'final' },
                  },
                })),
              output: () => 'child output',
              onDone: { target: 'after', actions: [] },
            },
          ],
        },
        after: {},
      },
    }).start()
    expect(child.status).toBe('active')
    m.send({ type: 'poke' })
    expect(child.status).toBe('done')
    expect(m.configuration).toEqual(['after'])
  })

  it('stops a child machine when its state exits', () => {
    let child!: Interpreter
    const m = createInterpreter({
      states: {
        a: {
          on: { leave: { target: 'b' } },
          invoke: [{ src: () => (child = createInterpreter({ states: { x: {} } })) }],
        },
        b: {},
      },
    }).start()
    m.send({ type: 'leave' })
    expect(child.status).toBe('stopped')
  })
})

describe('inspection', () => {
  it('streams events, microsteps and snapshots', () => {
    const seen: string[] = []
    const m = createInterpreter({ states: { a: { on: { go: { target: 'b' } } }, b: {} } })
    m.inspect(e => {
      if (e.type === '@xstate.event') seen.push(`event ${e.event.type}`)
      if (e.type === '@xstate.microstep')
        seen.push(`step ${e.transitions.map(t => `${t.source}->${t.targets.join(',')}`).join(' ')}`)
      if (e.type === '@xstate.snapshot') seen.push(`snapshot ${e.configuration.join(',')}`)
    })
    m.start().send({ type: 'go' })
    expect(seen).toEqual(['snapshot a', 'event go', 'step a->b', 'snapshot b'])
  })
})
