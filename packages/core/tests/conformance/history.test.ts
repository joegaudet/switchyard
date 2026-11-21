// History pseudo-states: W3C SCXML 3.10, Appendix D (exitStates history recording,
// addDescendantStatesToEnter); IRP 387, 388, 579, 580.
import { describe, expect, it } from 'vitest'
import { createInterpreter, type MachineConfig } from '../../src/interpreter.js'

const machine = (history: 'shallow' | 'deep', target?: string): MachineConfig => ({
  states: {
    editing: {
      on: { leave: { target: 'away' } },
      initial: 'text',
      states: {
        hist: { type: 'history', history, ...(target ? { target } : {}) },
        text: { on: { next: { target: 'editing.styles.italic' } } },
        styles: { states: { bold: {}, italic: {} } },
      },
    },
    away: { on: { back: { target: 'editing.hist' } } },
  },
})

describe('history', () => {
  it('shallow resumes the last active child, entering its default descendants', () => {
    const m = createInterpreter(machine('shallow')).start()
    m.send({ type: 'next' }).send({ type: 'leave' }).send({ type: 'back' })
    expect(m.configuration).toEqual(['editing', 'editing.styles', 'editing.styles.bold'])
  })

  it('deep resumes every last active descendant', () => {
    const m = createInterpreter(machine('deep')).start()
    m.send({ type: 'next' }).send({ type: 'leave' }).send({ type: 'back' })
    expect(m.configuration).toEqual(['editing', 'editing.styles', 'editing.styles.italic'])
  })

  it('with nothing recorded, enters its default target', () => {
    const m = createInterpreter({
      initial: 'away',
      states: (machine('shallow', 'editing.styles').states ?? {}) as MachineConfig['states'],
    }).start()
    m.send({ type: 'back' })
    expect(m.configuration).toEqual(['editing', 'editing.styles', 'editing.styles.bold'])
  })

  it("with nothing recorded and no default, enters the parent's initial state", () => {
    const m = createInterpreter({
      initial: 'away',
      states: (machine('shallow').states ?? {}) as MachineConfig['states'],
    }).start()
    m.send({ type: 'back' })
    expect(m.configuration).toEqual(['editing', 'editing.text'])
  })

  it('deep history restores every region of a parallel descendant', () => {
    const m = createInterpreter({
      states: {
        doc: {
          on: { leave: { target: 'away' } },
          states: {
            h: { type: 'history', history: 'deep' },
            format: {
              type: 'parallel',
              states: {
                bold: { states: { off: { on: { b: { target: 'doc.format.bold.on' } } }, on: {} } },
                italic: {
                  states: { off: { on: { i: { target: 'doc.format.italic.on' } } }, on: {} },
                },
              },
            },
          },
        },
        away: { on: { back: { target: 'doc.h' } } },
      },
    }).start()
    m.send({ type: 'i' }).send({ type: 'leave' }).send({ type: 'back' })
    expect(m.configuration).toEqual([
      'doc',
      'doc.format',
      'doc.format.bold',
      'doc.format.bold.off',
      'doc.format.italic',
      'doc.format.italic.on',
    ])
  })

  it('is never part of the configuration and is not an initial default', () => {
    const m = createInterpreter({
      states: { s: { states: { h: { type: 'history' }, a: {} } } },
    }).start()
    expect(m.configuration).toEqual(['s', 's.a'])
  })
})
