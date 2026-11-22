// Run-to-completion: eventless transitions, internal vs external queues, done events, errors.
// W3C SCXML 3.12.1, 3.13, 3.7.1, 5.10.2 (error.execution); IRP 144, 355, 372, 570, 579.
import { describe, expect, it, vi } from 'vitest'
import { createInterpreter } from '../../src/interpreter.js'
import { tracer } from './trace.js'

describe('eventless transitions', () => {
  it('are taken until the configuration is stable', () => {
    const m = createInterpreter({
      states: {
        a: { always: [{ target: 'b' }] },
        b: { always: [{ target: 'c' }] },
        c: {},
      },
    }).start()
    expect(m.configuration).toEqual(['c'])
  })

  it('re-check their guards after every event', () => {
    let count = 0
    const m = createInterpreter({
      states: {
        counting: {
          on: { inc: { actions: [() => void count++] } },
          always: [{ guard: () => count >= 2, target: 'enough' }],
        },
        enough: {},
      },
    }).start()
    m.send({ type: 'inc' })
    expect(m.configuration).toEqual(['counting'])
    m.send({ type: 'inc' })
    expect(m.configuration).toEqual(['enough'])
  })

  it('run before raised events', () => {
    const { log, t } = tracer()
    createInterpreter({
      states: {
        a: { entry: [(_e, { raise }) => raise({ type: 'r' })], always: [{ target: 'b' }] },
        b: { entry: [t('b')], on: { r: { actions: [t('r in b')] } } },
      },
    }).start()
    expect(log).toEqual(['b', 'r in b'])
  })
})

describe('queues', () => {
  it('drains raised events before the next external event', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: {
          on: {
            go: {
              actions: [
                (_e, { send, raise }) => {
                  send({ type: 'external' })
                  raise({ type: 'internal' })
                },
              ],
            },
            internal: { actions: [t('internal')] },
            external: { actions: [t('external')] },
          },
        },
      },
    }).start()
    m.send({ type: 'go' })
    expect(log).toEqual(['internal', 'external'])
  })

  it('an event sent from an action runs after the current one completes', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: {
          on: { first: { target: 'b', actions: [(_e, { send }) => send({ type: 'second' })] } },
          exit: [t('exit a')],
        },
        b: { entry: [t('enter b')], on: { second: { actions: [t('second')] } } },
      },
    }).start()
    m.send({ type: 'first' })
    expect(log).toEqual(['exit a', 'enter b', 'second'])
  })

  it('an event sent while starting runs once start has entered the initial states', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: {
          entry: [t('enter a'), (_e, { send }) => send({ type: 'go' })],
          on: { go: { target: 'b' } },
        },
        b: { entry: [t('enter b')] },
      },
    }).start()
    expect(log).toEqual(['enter a', 'enter b'])
    expect(m.configuration).toEqual(['b'])
  })

  it('notifies subscribers once per macrostep, with the stable configuration', () => {
    const seen: string[][] = []
    const m = createInterpreter({
      states: { a: { on: { e: { target: 'b' } } }, b: { always: [{ target: 'c' }] }, c: {} },
    })
    m.subscribe(i => void seen.push(i.configuration))
    m.start().send({ type: 'e' }).send({ type: 'ignored' })
    expect(seen).toEqual([['a'], ['c']])
  })

  it('unsubscribes', () => {
    const fn = vi.fn()
    const m = createInterpreter({ states: { a: { on: { e: { target: 'b' } } }, b: {} } })
    const off = m.subscribe(fn)
    off()
    m.start().send({ type: 'e' })
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('final states', () => {
  it('raise done.state.<parent> when a compound state completes', () => {
    const m = createInterpreter({
      states: {
        job: {
          on: { 'done.state.job': { target: 'next' } },
          states: {
            working: { on: { finish: { target: 'job.finished' } } },
            finished: { type: 'final' },
          },
        },
        next: {},
      },
    }).start()
    m.send({ type: 'finish' })
    expect(m.configuration).toEqual(['next'])
  })

  it('a parallel state is done when every region is in a final state', () => {
    const m = createInterpreter({
      states: {
        p: {
          type: 'parallel',
          on: { 'done.state.p': { target: 'after' } },
          states: {
            r1: { states: { a: { on: { e1: { target: 'p.r1.done' } } }, done: { type: 'final' } } },
            r2: { states: { b: { on: { e2: { target: 'p.r2.done' } } }, done: { type: 'final' } } },
          },
        },
        after: {},
      },
    }).start()
    m.send({ type: 'e1' })
    expect(m.matches('p')).toBe(true)
    m.send({ type: 'e2' })
    expect(m.configuration).toEqual(['after'])
  })

  it('a final child of the root finishes the machine, which then ignores events', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: { on: { e: { target: 'end' } } },
        end: { type: 'final', exit: [t('exit end')] },
      },
    }).start()
    expect(m.status).toBe('active')
    m.send({ type: 'e' })
    expect(m.status).toBe('done')
    m.send({ type: 'e' })
    expect(m.configuration).toEqual(['end'])
    expect(log).toEqual([])
  })
})

describe('errors', () => {
  it('a throwing action raises error.execution, skips the rest of its block, and keeps running', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: {
          on: {
            e: {
              actions: [
                () => {
                  throw new Error('boom')
                },
                t('skipped'),
              ],
            },
            'error.execution': {
              target: 'failed',
              actions: [ev => void log.push(String(ev['error']))],
            },
          },
          exit: [t('exit a')],
        },
        failed: {},
      },
    }).start()
    m.send({ type: 'e' })
    // The source exits before the transition's actions run, so the error arrives after.
    expect(log).toEqual(['exit a', 'Error: boom'])
    expect(m.configuration).toEqual(['failed'])
  })
})

describe('queries', () => {
  it('matches a state and its ancestors', () => {
    const m = createInterpreter({ states: { a: { states: { a1: {} } }, b: {} } }).start()
    expect(m.matches('a')).toBe(true)
    expect(m.matches('a.a1')).toBe(true)
    expect(m.matches('b')).toBe(false)
  })

  it('stops', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: { a: { exit: [t('exit a')], on: { e: { target: 'b' } } }, b: {} },
    })
    m.start().stop()
    expect(m.status).toBe('stopped')
    m.send({ type: 'e' })
    expect(m.configuration).toEqual([])
    expect(log).toEqual(['exit a'])
  })
})
