// Snapshots: the configuration as leaf paths plus recorded history, and restore, which
// re-derives the full configuration (ancestors, default descendants, every region) without
// running actions, then restarts the active states' timers and invokes.
import { describe, expect, it, vi } from 'vitest'
import { createInterpreter, manualClock, type MachineConfig } from '../../src/index.js'

const config = (log: string[] = []): MachineConfig => ({
  states: {
    idle: { on: { go: { target: 'editing.styles.italic' }, back: { target: 'editing.h' } } },
    editing: {
      entry: [() => void log.push('enter editing')],
      on: { leave: { target: 'idle' } },
      states: {
        h: { type: 'history', history: 'deep' },
        text: {},
        styles: { states: { bold: {}, italic: {} } },
      },
    },
  },
})

describe('snapshot and restore', () => {
  it('a snapshot names the active leaves and the recorded history', () => {
    const m = createInterpreter(config()).start().send({ type: 'go' }).send({ type: 'leave' })
    expect(m.snapshot()).toEqual({
      status: 'active',
      configuration: ['idle'],
      history: { 'editing.h': ['editing.styles.italic'] },
    })
  })

  it('restore rebuilds the configuration without running actions, history included', () => {
    const snap = createInterpreter(config())
      .start()
      .send({ type: 'go' })
      .send({ type: 'leave' })
      .snapshot()
    const log: string[] = []
    const m = createInterpreter(config(log)).restore(JSON.parse(JSON.stringify(snap)))
    expect(m.status).toBe('active')
    expect(m.configuration).toEqual(['idle'])
    expect(log).toEqual([])
    m.send({ type: 'back' })
    expect(m.configuration).toEqual(['editing', 'editing.styles', 'editing.styles.italic'])
  })

  it('a compound leaf is completed with its default descendants', () => {
    const log: string[] = []
    const m = createInterpreter(config(log)).restore({ configuration: ['editing'] })
    expect(m.configuration).toEqual(['editing', 'editing.text'])
    expect(log).toEqual([])
  })

  it('fills in every region of a parallel state', () => {
    const m = createInterpreter({
      type: 'parallel',
      states: { a: { states: { a1: {}, a2: {} } }, b: { states: { b1: {}, b2: {} } } },
    }).restore({ configuration: ['b.b2'] })
    expect(m.configuration).toEqual(['a', 'a.a1', 'b', 'b.b2'])
  })

  it('rejects unknown paths and two children of one compound state', () => {
    const m = () => createInterpreter(config())
    expect(() => m().restore({ configuration: ['nope'] })).toThrow(/unknown state "nope"/)
    expect(() => m().restore({ configuration: ['idle', 'editing.text'] })).toThrow(
      /both "idle" and "editing.text"/,
    )
  })

  it('restarts the timers and invokes of the restored states', () => {
    const clock = manualClock()
    const src = vi.fn(() => () => {})
    const m = createInterpreter(
      {
        states: {
          a: {},
          waiting: { after: { 100: { target: 'a' } }, invoke: [{ src }] },
        },
      },
      { clock },
    ).restore({ configuration: ['waiting'] })
    expect(src).toHaveBeenCalledOnce()
    clock.advance(100)
    expect(m.configuration).toEqual(['a'])
  })

  it('restoring a running machine replaces its configuration and stops its actors', () => {
    const cleanup = vi.fn()
    const m = createInterpreter({
      states: { a: { invoke: [{ src: () => cleanup }] }, b: {} },
    }).start()
    m.restore({ configuration: ['b'] })
    expect(cleanup).toHaveBeenCalledOnce()
    expect(m.configuration).toEqual(['b'])
  })
})
