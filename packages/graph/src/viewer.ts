// The live diagram: renders a machine's SVG, marks the active states, and flashes each
// transition as it is taken. Browser-only, hence its own entrypoint.
import type { Machine } from '@switchyard-ts/core'
import { toGraph, type MachineClass } from './graph.js'
import { toSvg } from './svg.js'

// Inside a quoted attribute selector only `"` and `\` need escaping.
const attr = (value: string) => value.replace(/["\\]/g, '\\$&')

/** Every active path: the snapshot's leaves and all their ancestors. */
function activePaths(machine: Machine<unknown>): Set<string> {
  const out = new Set<string>()
  for (const leaf of machine.snapshot().configuration) {
    const parts = leaf.split('.')
    parts.forEach((_, i) => out.add(parts.slice(0, i + 1).join('.')))
  }
  return out
}

/** Draws `machine` into `host` and keeps it live. Resolves to a function that stops updating. */
export async function mountDiagram(host: Element, machine: Machine<unknown>): Promise<() => void> {
  host.innerHTML = await toSvg(toGraph(machine.constructor as unknown as MachineClass))
  const sync = () => {
    const active = activePaths(machine)
    for (const el of host.querySelectorAll<SVGElement>('[data-state]'))
      el.classList.toggle('sy-active', active.has(el.dataset['state']!))
  }
  const offSubscribe = machine.subscribe(sync)
  const offInspect = machine.inspect(e => {
    if (e.type !== '@xstate.microstep') return
    for (const t of e.transitions) {
      const target = t.targets[0] ?? t.source
      const edge = host.querySelector(
        `[data-source="${attr(t.source)}"][data-target="${attr(target)}"]`,
      )
      edge?.classList.add('sy-taken')
      setTimeout(() => edge?.classList.remove('sy-taken'), 600)
    }
  })
  sync()
  return () => {
    offSubscribe()
    offInspect()
  }
}

/** `<switchyard-diagram>`: set its `machine` property to draw and follow a machine. */
export class SwitchyardDiagram extends HTMLElement {
  #off?: Promise<() => void>

  /** Draws this machine, replacing any drawn before, and follows its state. */
  set machine(machine: Machine<unknown>) {
    void this.#off?.then(off => off())
    this.#off = mountDiagram(this, machine)
  }

  /** Stops following the machine when the element leaves the document. */
  disconnectedCallback() {
    void this.#off?.then(off => off())
  }
}

/** Registers {@link SwitchyardDiagram} as a custom element, once, under `name`. */
export function defineDiagramElement(name = 'switchyard-diagram'): void {
  if (!customElements.get(name)) customElements.define(name, SwitchyardDiagram)
}

declare global {
  interface HTMLElementTagNameMap {
    'switchyard-diagram': SwitchyardDiagram
  }
}
