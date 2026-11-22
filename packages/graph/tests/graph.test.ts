import { describe, expect, it } from 'vitest'
import {
  describeInterface,
  interfaceToMermaid,
  states,
  toDot,
  toGraph,
  toMermaid,
  toSvg,
  topology,
  topologyToMermaid,
} from '../src/index.js'
import { Editor, Fetch, Uploader } from './fixtures.js'

describe('toGraph', () => {
  it('reads the state tree, with initial states, history, entry actions and invokes', () => {
    const g = toGraph(Fetch)
    expect(g.name).toBe('Fetch')
    expect(states(g).map(s => `${s.id || '(root)'}:${s.type}`)).toEqual([
      '(root):compound',
      'idle:atomic',
      'loading:compound',
      'loading.first:atomic',
      'loading.retrying:atomic',
      'loading.$history:history',
      'failed:atomic',
      'done:final',
    ])
    const loading = states(g).find(s => s.id === 'loading')!
    expect(loading.initial).toBe('loading.first')
    expect(loading.entry).toEqual(['showSpinner'])
    expect(loading.invoke).toEqual(['load'])
    expect(g.root.initial).toBe('idle')
  })

  it('labels transitions event [guard] / action, in document order', () => {
    expect(toGraph(Fetch).transitions.map(t => `${t.source} -> ${t.target}: ${t.label}`)).toEqual([
      'idle -> loading: fetch',
      'loading -> failed: after 5000ms / timeout',
      'loading -> done: done: load',
      'loading -> failed: error: load',
      'loading.first -> loading.retrying: stall',
      'failed -> loading.$history: retry [hasRetriesLeft && isOnline]',
    ])
  })

  it('reads plain interpreter configs too', () => {
    const g = toGraph({ states: { a: { on: { go: { target: 'b' } } }, b: {} } }, 'Plain')
    expect(g.transitions).toEqual([
      { source: 'a', target: 'b', event: 'go', actions: [], label: 'go' },
    ])
  })
})

describe('Mermaid', () => {
  it('draws compound states, history, final states and labels', () => {
    expect(toMermaid(toGraph(Fetch))).toMatchInlineSnapshot(`
      "stateDiagram-v2
        [*] --> idle
        state "idle" as idle
        state "loading" as loading {
          [*] --> loading_first
          state "first" as loading_first
          state "retrying" as loading_retrying
          state "H" as loading__history
        }
        state "failed" as failed
        state "done" as done
        done --> [*]
        idle --> loading : fetch
        loading --> failed : after 5000ms / timeout
        loading --> done : done: load
        loading --> failed : error: load
        loading_first --> loading_retrying : stall
        failed --> loading__history : retry [hasRetriesLeft && isOnline]
      "
    `)
  })

  it('draws parallel regions inside a wrapper state', () => {
    expect(toMermaid(toGraph(Editor))).toMatchInlineSnapshot(`
      "stateDiagram-v2
        state "Editor" as root {
          state "bold" as bold {
            [*] --> bold_off
            state "off" as bold_off
            state "on" as bold_on
          }
          --
          state "italic" as italic {
            [*] --> italic_off
            state "off" as italic_off
            state "on" as italic_on
          }
        }
        bold_off --> bold_on : embolden
      "
    `)
  })
})

describe('DOT', () => {
  it('draws compound states as clusters, with edges clipped to them', () => {
    expect(toDot(toGraph(Fetch))).toMatchInlineSnapshot(`
      "digraph "Fetch" {
        compound=true; rankdir=LR;
        node [shape=box, style=rounded, fontname="Helvetica"];
        edge [fontname="Helvetica", fontsize=10];
        __start [shape=point, width=0.15];
        __start -> idle;
        idle [label="idle"];
        subgraph cluster_loading {
          label="loading"; style=rounded;
          loading [shape=point, style=invis];
          loading__start [shape=point, width=0.1];
          loading__start -> loading_first;
          loading_first [label="first"];
          loading_retrying [label="retrying"];
          loading__history [shape=circle, label="H"];
        }
        failed [label="failed"];
        done [label="done", peripheries=2];
        idle -> loading [label="fetch", lhead=cluster_loading];
        loading -> failed [label="after 5000ms / timeout", ltail=cluster_loading];
        loading -> done [label="done: load", ltail=cluster_loading];
        loading -> failed [label="error: load", ltail=cluster_loading];
        loading_first -> loading_retrying [label="stall"];
        failed -> loading__history [label="retry [hasRetriesLeft && isOnline]"];
      }
      "
    `)
  })
})

describe('SVG', () => {
  it('lays out every state and transition, with data hooks for the live viewer', async () => {
    const svg = await toSvg(toGraph(Fetch))
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    for (const id of [
      'idle',
      'loading',
      'loading.first',
      'loading.retrying',
      'loading.$history',
      'failed',
      'done',
    ])
      expect(svg).toContain(`data-state="${id}"`)
    expect(svg.match(/class="sy-transition"/g)).toHaveLength(6 + 2)
    expect(svg).toContain('data-source="failed" data-target="loading.$history" data-event="retry"')
    expect(svg).toContain('retry [hasRetriesLeft &amp;&amp; isOnline]')
    expect(svg).not.toMatch(/NaN|undefined/)
  })

  it('is deterministic', async () => {
    expect(await toSvg(toGraph(Fetch))).toBe(await toSvg(toGraph(Fetch)))
  })
})

describe('interface view', () => {
  it('lists events with their sources, guards, actions and invokes', () => {
    const iface = describeInterface(Fetch)
    expect(iface.events).toEqual([
      { name: 'fetch', from: ['idle'] },
      { name: 'stall', from: ['loading.first'] },
      { name: 'retry', from: ['failed'] },
    ])
    expect(iface.guards).toEqual(['hasRetriesLeft && isOnline'])
    expect(iface.actions).toEqual([
      { name: 'timeout', on: 'after 5000ms in loading' },
      { name: 'showSpinner', on: 'entry loading' },
    ])
    expect(iface.invokes).toEqual([{ id: 'load', state: 'loading' }])
    expect(interfaceToMermaid(iface)).toMatchInlineSnapshot(`
      "classDiagram
        class Fetch {
          <<machine>>
          +fetch() idle
          +stall() loading.first
          +retry() failed
          -guard hasRetriesLeft&&isOnline
          #timeout() after 5000ms in loading
          #showSpinner() entry loading
          #invoke load
        }
      "
    `)
  })
})

describe('actor topology', () => {
  it('walks the live tree of spawned and invoked machines', () => {
    const m = new Uploader()
    m.add('a.txt')
    const tree = topology(m)
    expect(tree).toEqual({
      id: '(root)',
      machine: 'Uploader',
      configuration: ['working'],
      children: [
        { id: 'main', machine: 'FileUpload', configuration: ['sending'], children: [] },
        { id: 'a.txt', machine: 'FileUpload', configuration: ['sending'], children: [] },
      ],
    })
    expect(topologyToMermaid(tree)).toMatchInlineSnapshot(`
      "flowchart LR
        actor["(root): Uploader<br/>working"]
        actor_main["main: FileUpload<br/>sending"]
        actor --> actor_main
        actor_a_txt["a.txt: FileUpload<br/>sending"]
        actor --> actor_a_txt
      "
    `)
  })
})

describe('transitions handled in every state', () => {
  const config = {
    states: { a: { on: { go: { target: 'b' } } }, b: {} },
    on: { reset: { target: 'a' } },
  }

  it('come from an "any state" marker in every format', async () => {
    const g = toGraph(config, 'Resettable')
    expect(toMermaid(g)).toContain('state "any state" as __any')
    expect(toMermaid(g)).toContain('__any --> a : reset')
    expect(toDot(g)).toContain('__any [shape=plaintext, label="any state"];')
    expect(toDot(g)).toContain('__any -> a [label="reset"];')
    const svg = await toSvg(g)
    expect(svg).toContain('data-source="" data-target="a" data-event="reset"')
    expect(svg).toContain('class="sy-any"')
  })
})

describe('named delays', () => {
  it('label as the delay name, not as milliseconds', () => {
    const g = toGraph({ states: { a: { after: { greenFor: { target: 'b' } } }, b: {} } })
    expect(g.transitions[0]!.label).toBe('after greenFor')
  })
})
