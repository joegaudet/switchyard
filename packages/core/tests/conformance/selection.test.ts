// Transition selection (event descriptors follow xstate v5, not SCXML prefixes): W3C SCXML 3.13 and Appendix D (selectTransitions,
// removeConflictingTransitions), IRP tests 403a/403b/404/405/406 in spirit.
import { describe, expect, it } from 'vitest'
import { createInterpreter } from '../../src/interpreter.js'
import { tracer } from './trace.js'

describe('initial states', () => {
  it('enters the named initial, else the first child, recursively', () => {
    const m = createInterpreter({
      initial: 'b',
      states: { a: {}, b: { states: { b1: {}, b2: {} } } },
    }).start()
    expect(m.configuration).toEqual(['b', 'b.b1'])
  })

  it('rejects an unknown initial or target when built', () => {
    expect(() => createInterpreter({ initial: 'nope', states: { a: {} } })).toThrow(/nope/)
    expect(() => createInterpreter({ states: { a: { on: { go: { target: 'zz' } } } } })).toThrow(
      /zz/,
    )
  })
})

describe('selection', () => {
  it('prefers the innermost state that handles the event', () => {
    const { log, t } = tracer()
    createInterpreter({
      states: {
        a: {
          on: { e: { actions: [t('outer')] } },
          states: { a1: { on: { e: { actions: [t('inner')] } } } },
        },
      },
    })
      .start()
      .send({ type: 'e' })
    expect(log).toEqual(['inner'])
  })

  it('falls through to an ancestor when the child has no match', () => {
    const m = createInterpreter({
      states: { a: { on: { e: { target: 'b' } }, states: { a1: {} } }, b: {} },
    }).start()
    m.send({ type: 'e' })
    expect(m.configuration).toEqual(['b'])
  })

  it('takes the first enabled transition in document order, skipping false guards', () => {
    const { log, t } = tracer()
    createInterpreter({
      states: {
        a: {
          on: {
            e: [
              { guard: () => false, actions: [t('first')] },
              { actions: [t('second')] },
              { actions: [t('third')] },
            ],
          },
        },
      },
    })
      .start()
      .send({ type: 'e' })
    expect(log).toEqual(['second'])
  })

  it('passes the event to guards and actions', () => {
    const seen: unknown[] = []
    createInterpreter({
      states: {
        a: {
          on: {
            e: {
              guard: ev => ev['n'] === 2,
              actions: [ev => void seen.push(ev['n'])],
            },
          },
        },
      },
    })
      .start()
      .send({ type: 'e', n: 1 })
      .send({ type: 'e', n: 2 })
    expect(seen).toEqual([2])
  })

  it('ignores an event nothing handles', () => {
    const m = createInterpreter({ states: { a: {}, b: {} } }).start()
    m.send({ type: 'nothing' })
    expect(m.configuration).toEqual(['a'])
  })
})

describe('event descriptors', () => {
  const handles = (descriptor: string, type: string) => {
    let hit = false
    createInterpreter({
      states: { a: { on: { [descriptor]: { actions: [() => void (hit = true)] } } } },
    })
      .start()
      .send({ type })
    return hit
  }

  it('match exactly, or by whole tokens with a trailing .*', () => {
    expect(handles('error', 'error')).toBe(true)
    expect(handles('error', 'error.execution')).toBe(false)
    expect(handles('error.*', 'error.execution')).toBe(true)
    expect(handles('error.*', 'error')).toBe(true)
    expect(handles('err.*', 'error')).toBe(false)
    expect(handles('error.execution', 'error')).toBe(false)
  })

  it('a space-separated list matches any of its descriptors', () => {
    expect(handles('a b', 'b')).toBe(true)
  })

  it('* matches any event', () => {
    expect(handles('*', 'anything.at.all')).toBe(true)
  })
})

describe('parallel regions and conflicts', () => {
  it('every region takes its own transition for one event, in document order', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      type: 'parallel',
      states: {
        r1: { states: { a: { on: { e: { target: 'r1.a2', actions: [t('r1')] } } }, a2: {} } },
        r2: { states: { b: { on: { e: { target: 'r2.b2', actions: [t('r2')] } } }, b2: {} } },
      },
    }).start()
    m.send({ type: 'e' })
    expect(log).toEqual(['r1', 'r2'])
    expect(m.configuration).toEqual(['r1', 'r1.a2', 'r2', 'r2.b2'])
  })

  it('of two conflicting siblings, the first in document order wins', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        p: {
          type: 'parallel',
          states: {
            r1: { states: { a: { on: { e: { target: 'out', actions: [t('leave')] } } } } },
            r2: {
              states: { b: { on: { e: { target: 'p.r2.b2', actions: [t('stay')] } } }, b2: {} },
            },
          },
        },
        out: {},
      },
    }).start()
    m.send({ type: 'e' })
    expect(log).toEqual(['leave'])
    expect(m.configuration).toEqual(['out'])
  })

  it("a descendant's transition preempts its ancestor's conflicting one", () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        p: {
          type: 'parallel',
          on: { e: { target: 'out', actions: [t('ancestor')] } },
          states: {
            r1: { states: { a: {} } },
            r2: {
              states: {
                b: { on: { e: { target: 'p.r2.b2', actions: [t('descendant')] } } },
                b2: {},
              },
            },
          },
        },
        out: {},
      },
    }).start()
    m.send({ type: 'e' })
    expect(log).toEqual(['descendant'])
    expect(m.configuration).toEqual(['p', 'p.r1', 'p.r1.a', 'p.r2', 'p.r2.b2'])
  })
})
