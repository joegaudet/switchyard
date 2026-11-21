// Regressions from review of the interpreter against W3C SCXML Appendix D (F1–F6), plus
// subscriber re-entrancy, which was already correct but untested.
import { describe, expect, it } from 'vitest'
import { createInterpreter } from '../../src/interpreter.js'

describe('F1 parallel root: a transition whose domain is the root drops the other regions', () => {
  it('cross-region transition keeps every region active', () => {
    const m = createInterpreter({
      type: 'parallel',
      states: {
        r1: { states: { a: { on: { e: { target: 'r2.b2' } } } } },
        r2: { states: { b: {}, b2: {} } },
      },
    }).start()
    m.send({ type: 'e' })
    expect(m.configuration).toEqual(['r1', 'r1.a', 'r2', 'r2.b2'])
  })

  it('a transition on the parallel root itself keeps every region active', () => {
    const m = createInterpreter({
      type: 'parallel',
      on: { e: { target: 'r1.a2' } },
      states: { r1: { states: { a: {}, a2: {} } }, r2: { states: { b: {} } } },
    }).start()
    m.send({ type: 'e' })
    expect(m.configuration).toEqual(['r1', 'r1.a2', 'r2', 'r2.b'])
  })
})

describe('F2 stop() while an action is running', () => {
  it('stop() from a transition action leaves an empty configuration and balanced entry/exit', () => {
    let entered = 0
    let exited = 0
    const m = createInterpreter({
      states: {
        a: { on: { e: { target: 'b', actions: [() => void m.stop()] } } },
        b: { entry: [() => void entered++], exit: [() => void exited++] },
      },
    }).start()
    m.send({ type: 'e' })
    expect(m.status).toBe('stopped')
    expect(m.configuration).toEqual([])
    expect(entered).toBe(exited)
  })

  it('stop() from an exit action runs each exit action once', () => {
    let exits = 0
    const m = createInterpreter({
      states: {
        a: { exit: [() => (exits++, void m.stop())], on: { e: { target: 'b' } } },
        b: {},
      },
    }).start()
    m.send({ type: 'e' })
    expect(exits).toBe(1)
    expect(m.configuration).toEqual([])
  })

  it('an exit action that sends while stopping does not run a macrostep', () => {
    const log: string[] = []
    const m = createInterpreter({
      states: {
        a: { exit: [(_e, { send }) => send({ type: 'e' })], on: { e: { target: 'b' } } },
        b: { entry: [() => void log.push('enter b')] },
      },
    }).start()
    m.stop()
    expect(log).toEqual([])
    expect(m.configuration).toEqual([])
  })
})

describe('F3 history defaults that crash', () => {
  it('a history state inside a parallel state, with nothing recorded, enters every region', () => {
    const m = createInterpreter({
      states: {
        away: { on: { back: { target: 'p.h' } } },
        p: {
          type: 'parallel',
          states: { h: { type: 'history' }, r1: { states: { x: {} } }, r2: { states: { y: {} } } },
        },
      },
    }).start()
    m.send({ type: 'back' })
    expect(m.configuration).toEqual(['p', 'p.r1', 'p.r1.x', 'p.r2', 'p.r2.y'])
  })

  it('initial naming a history state without a target is rejected at build, not a stack overflow at start', () => {
    expect(() =>
      createInterpreter({ initial: 'h', states: { h: { type: 'history' }, a: {} } }),
    ).toThrow(/history/)
  })
})

describe('F4 done events for a parallel state nested in a parallel state', () => {
  const nested = (innerLast: boolean) =>
    createInterpreter({
      states: {
        p: {
          type: 'parallel',
          on: { 'done.state.p': { target: 'after' } },
          states: {
            q: {
              type: 'parallel',
              states: {
                q1: { states: { w: { on: { fq: { target: 'p.q.q1.f' } } }, f: { type: 'final' } } },
                q2: { states: { f: { type: 'final' } } },
              },
            },
            s: { states: { w: { on: { fs: { target: 'p.s.f' } } }, f: { type: 'final' } } },
          },
        },
        after: {},
      },
    })
      .start()
      .send({ type: innerLast ? 'fs' : 'fq' })
      .send({ type: innerLast ? 'fq' : 'fs' })

  it('raises done.state.p when the sibling region finishes last (passes today)', () => {
    expect(nested(false).configuration).toEqual(['after'])
  })

  it('raises done.state.p when the nested parallel finishes last', () => {
    expect(nested(true).configuration).toEqual(['after'])
  })

  it('a parallel root finishes when its last region is a nested parallel', () => {
    const m = createInterpreter({
      type: 'parallel',
      states: {
        a: { states: { f: { type: 'final' } } },
        q: {
          type: 'parallel',
          states: {
            q1: { states: { w: { on: { go: { target: 'q.q1.f' } } }, f: { type: 'final' } } },
            q2: { states: { f: { type: 'final' } } },
          },
        },
      },
    }).start()
    m.send({ type: 'go' })
    expect(m.status).toBe('done')
  })
})

describe('F5 a throwing guard', () => {
  it('is treated as false, raises error.execution, and keeps the macrostep intact', () => {
    const log: string[] = []
    const m = createInterpreter({
      states: {
        a: {
          on: {
            e: [
              {
                guard: () => {
                  throw new Error('bad guard')
                },
                target: 'b',
              },
              { target: 'c' },
            ],
            'error.execution': { actions: [() => void log.push('error')] },
          },
        },
        b: {},
        c: { on: { 'error.execution': { actions: [() => void log.push('error in c')] } } },
      },
    }).start()
    expect(() => m.send({ type: 'e' })).not.toThrow()
    expect(m.configuration).toEqual(['c'])
    expect(log).toEqual(['error in c'])
  })

  it('a throw mid-macrostep does not let the next external event jump the internal queue', () => {
    const log: string[] = []
    let explode = true
    const m = createInterpreter({
      states: {
        a: {
          on: {
            go: { target: 'b', actions: [(_e, { raise }) => raise({ type: 'internal' })] },
          },
        },
        b: {
          always: [
            {
              guard: () => {
                if (explode) {
                  explode = false
                  throw new Error('x')
                }
                return false
              },
              target: 'a',
            },
          ],
          on: {
            internal: { actions: [() => void log.push('internal')] },
            external: { actions: [() => void log.push('external')] },
          },
        },
      },
    }).start()
    expect(() => m.send({ type: 'go' })).not.toThrow()
    m.send({ type: 'external' })
    expect(log).toEqual(['internal', 'external'])
  })
})

describe('F6 root entry/exit actions', () => {
  it('runs the root entry action on start', () => {
    const log: string[] = []
    createInterpreter({ entry: [() => void log.push('root')], states: { a: {} } }).start()
    expect(log).toEqual(['root'])
  })
})

describe('subscriber reentrancy (expected green: missing coverage, not a defect)', () => {
  it('send from a subscriber during a drain is processed, iteratively, with a second notify', () => {
    const seen: string[][] = []
    let depth = 0
    let maxDepth = 0
    const m = createInterpreter({
      states: { a: { on: { e: { target: 'b' } } }, b: { on: { f: { target: 'c' } } }, c: {} },
    })
    m.subscribe(i => {
      depth++
      maxDepth = Math.max(maxDepth, depth)
      seen.push(i.configuration)
      if (i.matches('b')) i.send({ type: 'f' })
      depth--
    })
    m.start().send({ type: 'e' })
    expect(seen).toEqual([['a'], ['b'], ['c']])
    expect(maxDepth).toBe(1)
  })

  it("send from a subscriber during start()'s notify is processed", () => {
    const m = createInterpreter({ states: { a: { on: { e: { target: 'b' } } }, b: {} } })
    m.subscribe(i => void (i.matches('a') && i.send({ type: 'e' })))
    expect(m.start().configuration).toEqual(['b'])
  })

  it('stop from a subscriber during a drain drops the queued events', () => {
    const m = createInterpreter({
      states: { a: { on: { e: { target: 'b' } } }, b: { on: { f: { target: 'c' } } }, c: {} },
    })
    m.subscribe(i => void (i.matches('b') && i.stop()))
    m.start()
    m.send({ type: 'e' })
    m.send({ type: 'f' })
    expect(m.status).toBe('stopped')
    expect(m.configuration).toEqual([])
  })
})
