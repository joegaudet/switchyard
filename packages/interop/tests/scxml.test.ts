import { createInterpreter, type Action, type MachineConfig } from '@switchyard/core'
import { describe, expect, it } from 'vitest'
import { fromScxml, toScxml } from '../src/index.js'

// Configs from the conformance suite's areas: selection, entry/exit order, history, parallel,
// final/done, eventless. Each action logs its own name, so order is compared too.
const log: string[] = []
const act = (name: string): Action =>
  Object.defineProperty(() => void log.push(name), 'name', { value: name })
const on = (name: string) => ({ entry: [act(`enter ${name}`)], exit: [act(`exit ${name}`)] })

const cases: [string, MachineConfig, string[]][] = [
  [
    'hierarchy, LCCA and actions',
    {
      states: {
        a: {
          ...on('a'),
          states: { a1: { ...on('a1'), on: { e: { target: 'b.b2', actions: [act('t')] } } } },
        },
        b: { ...on('b'), states: { b1: on('b1'), b2: on('b2') }, on: { back: { target: 'a' } } },
      },
    },
    ['e', 'back', 'e'],
  ],
  [
    'internal vs external re-entry',
    {
      states: {
        a: {
          ...on('a'),
          on: { inner: { target: 'a.a2' }, outer: { target: 'a.a2', reenter: true } },
          states: { a1: on('a1'), a2: on('a2') },
        },
      },
    },
    ['inner', 'outer'],
  ],
  [
    'deep history',
    {
      states: {
        doc: {
          on: { leave: { target: 'away' } },
          states: {
            h: { type: 'history', history: 'deep' },
            text: { on: { style: { target: 'doc.styles.italic' } } },
            styles: { states: { bold: {}, italic: {} } },
          },
        },
        away: { on: { back: { target: 'doc.h' } } },
      },
    },
    ['style', 'leave', 'back'],
  ],
  [
    'parallel regions and done.state',
    {
      states: {
        p: {
          type: 'parallel',
          on: { 'done.state.p': { target: 'after' } },
          states: {
            r1: { states: { a: { on: { e1: { target: 'p.r1.f' } } }, f: { type: 'final' } } },
            r2: { states: { b: { on: { e2: { target: 'p.r2.f' } } }, f: { type: 'final' } } },
          },
        },
        after: { always: [{ target: 'end' }] },
        end: { type: 'final' },
      },
    },
    ['e1', 'e2'],
  ],
]

function run(config: MachineConfig, events: string[]) {
  log.length = 0
  const i = createInterpreter(config).start()
  const configs = [i.configuration]
  for (const type of events) configs.push(i.send({ type }).configuration)
  return { configs, log: [...log], status: i.status }
}

describe('SCXML round trip', () => {
  it.each(cases)('%s behaves the same after toScxml → fromScxml', (_name, config, events) => {
    const xml = toScxml(config, 'case')
    const expected = run(config, events)
    const actions = Object.fromEntries(expected.log.map(n => [n, act(n)]))
    expect(run(fromScxml(xml, { actions }), events)).toEqual(expected)
  })
})

describe('toScxml', () => {
  it('writes the W3C vocabulary', () => {
    expect(toScxml(cases[2]![1], 'doc')).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <scxml xmlns="http://www.w3.org/2005/07/scxml" xmlns:sy="https://joegaudet.com/switchyard" sy:descriptors="exact" version="1.0" name="doc" initial="doc">
        <state id="doc" initial="doc.text">
          <transition event="leave" target="away" type="internal"/>
          <history id="doc.h" type="deep">
            <transition target="doc.text"/>
          </history>
          <state id="doc.text">
            <transition event="style" target="doc.styles.italic" type="internal"/>
          </state>
          <state id="doc.styles" initial="doc.styles.bold">
            <state id="doc.styles.bold"/>
            <state id="doc.styles.italic"/>
          </state>
        </state>
        <state id="away">
          <transition event="back" target="doc.h" type="internal"/>
        </state>
      </scxml>
      "
    `)
  })

  it('refuses what SCXML cannot carry without a datamodel', () => {
    expect(() => toScxml({ states: { a: { after: { 10: { target: 'a' } } } } })).toThrow(/after/)
    expect(() => toScxml({ states: { a: { invoke: [{ src: () => {} }] } } })).toThrow(/invoke/)
  })
})

describe('fromScxml', () => {
  const doc = `<?xml version="1.0"?>
<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="s0">
  <state id="s0">
    <onentry><raise event="foo.bar"/><log label="entered s0"/></onentry>
    <transition event="foo" target="s1"/>
  </state>
  <state id="s1">
    <initial><transition target="s12"/></initial>
    <transition event="go" cond="ready" target="pass"/>
    <transition event="go" target="fail"/>
    <state id="s11"/>
    <state id="s12"/>
  </state>
  <final id="pass"/>
  <final id="fail"/>
</scxml>`

  it('imports a W3C-style document: raise, prefix descriptors, <initial>, cond', () => {
    const entered: string[] = []
    const config = fromScxml(doc, {
      guards: { ready: () => true },
      actions: { 'entered s0': () => void entered.push('s0') },
    })
    const i = createInterpreter(config).start()
    // `foo` matches the raised `foo.bar` (SCXML prefix matching), so s0 moves on at once.
    expect(i.configuration).toEqual(['s1', 's1.s12'])
    expect(entered).toEqual(['s0'])
    i.send({ type: 'go' })
    expect(i.configuration).toEqual(['pass'])
    expect(i.status).toBe('done')
  })

  it('refuses a missing guard, a datamodel, and executable content it cannot run', () => {
    expect(() => fromScxml(doc)).toThrow(/cond "ready" has no implementation/)
    expect(() => fromScxml('<scxml initial="a"><datamodel/><state id="a"/></scxml>')).toThrow(
      /<datamodel> is not supported/,
    )
    expect(() =>
      fromScxml(
        '<scxml initial="a"><state id="a"><onentry><script>x()</script></onentry></state></scxml>',
      ),
    ).toThrow(/<script> is not supported/)
  })
})
