// Entry/exit order and transition domains: W3C SCXML 3.13, Appendix D (computeExitSet,
// getTransitionDomain, findLCCA, addDescendantStatesToEnter); IRP 375–378, 504, 505.
import { describe, expect, it } from 'vitest'
import { createInterpreter } from '../../src/interpreter.js'
import { tracer } from './trace.js'

const traced = (t: ReturnType<typeof tracer>['t'], name: string) => ({
  entry: [t(`enter ${name}`)],
  exit: [t(`exit ${name}`)],
})

describe('entry and exit order', () => {
  it('exits the source, runs the transition, then enters the target', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: { ...traced(t, 'a'), on: { e: { target: 'b', actions: [t('t')] } } },
        b: traced(t, 'b'),
      },
    }).start()
    log.length = 0
    m.send({ type: 'e' })
    expect(log).toEqual(['exit a', 't', 'enter b'])
  })

  it('exits innermost first and enters outermost first, up to the LCCA', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: {
          ...traced(t, 'a'),
          states: { a1: { ...traced(t, 'a1'), on: { e: { target: 'b.b2', actions: [t('t')] } } } },
        },
        b: { ...traced(t, 'b'), states: { b1: traced(t, 'b1'), b2: traced(t, 'b2') } },
      },
    }).start()
    expect(log).toEqual(['enter a', 'enter a1'])
    log.length = 0
    m.send({ type: 'e' })
    expect(log).toEqual(['exit a1', 'exit a', 't', 'enter b', 'enter b2'])
  })

  it('enters parallel regions in document order and exits them in reverse', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        p: {
          type: 'parallel',
          ...traced(t, 'p'),
          on: { e: { target: 'out' } },
          states: { r1: traced(t, 'r1'), r2: traced(t, 'r2') },
        },
        out: {},
      },
    }).start()
    expect(log).toEqual(['enter p', 'enter r1', 'enter r2'])
    log.length = 0
    m.send({ type: 'e' })
    expect(log).toEqual(['exit r2', 'exit r1', 'exit p'])
  })

  it('entering one region of a parallel state enters its siblings by default', () => {
    const m = createInterpreter({
      states: {
        a: { on: { e: { target: 'p.r2.y' } } },
        p: {
          type: 'parallel',
          states: { r1: { states: { w: {}, x: {} } }, r2: { states: { z: {}, y: {} } } },
        },
      },
    }).start()
    m.send({ type: 'e' })
    expect(m.configuration).toEqual(['p', 'p.r1', 'p.r1.w', 'p.r2', 'p.r2.y'])
  })
})

describe('transition domains', () => {
  it('a transition from a compound state to its descendant does not exit the source', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: {
          ...traced(t, 'a'),
          on: { e: { target: 'a.a2' } },
          states: { a1: traced(t, 'a1'), a2: traced(t, 'a2') },
        },
      },
    }).start()
    log.length = 0
    m.send({ type: 'e' })
    expect(log).toEqual(['exit a1', 'enter a2'])
  })

  it('reenter: true exits and re-enters the source', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: {
        a: {
          ...traced(t, 'a'),
          on: { e: { target: 'a.a2', reenter: true } },
          states: { a1: traced(t, 'a1'), a2: traced(t, 'a2') },
        },
      },
    }).start()
    log.length = 0
    m.send({ type: 'e' })
    expect(log).toEqual(['exit a1', 'exit a', 'enter a', 'enter a2'])
  })

  it('a self-transition on an atomic state exits and re-enters it', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: { a: { ...traced(t, 'a'), on: { e: { target: 'a' } } } },
    }).start()
    log.length = 0
    m.send({ type: 'e' })
    expect(log).toEqual(['exit a', 'enter a'])
  })

  it('a targetless transition runs its actions and exits nothing', () => {
    const { log, t } = tracer()
    const m = createInterpreter({
      states: { a: { ...traced(t, 'a'), on: { e: { actions: [t('t')] } } } },
    }).start()
    log.length = 0
    m.send({ type: 'e' })
    expect(log).toEqual(['t'])
    expect(m.configuration).toEqual(['a'])
  })

  it('a transition may name several targets in different regions', () => {
    const m = createInterpreter({
      states: {
        a: { on: { e: { target: ['p.r1.x', 'p.r2.y'] } } },
        p: {
          type: 'parallel',
          states: { r1: { states: { w: {}, x: {} } }, r2: { states: { z: {}, y: {} } } },
        },
      },
    }).start()
    m.send({ type: 'e' })
    expect(m.configuration).toEqual(['p', 'p.r1', 'p.r1.x', 'p.r2', 'p.r2.y'])
  })
})
