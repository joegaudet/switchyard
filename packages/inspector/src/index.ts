// Streams a machine, and the child machines it spawns or invokes, to the Stately Inspector
// (https://stately.ai/docs/inspector) or anything else that takes its inspection calls.
import type { Machine } from '@switchyard-ts/core'
import { toXState } from '@switchyard-ts/interop'

/**
 * What the inspector reads from an actor: @statelyai/inspect takes the definition from
 * `logic.config` and the parent and root from `_parent`, not from the call's `info`.
 */
export interface ActorRefLike {
  sessionId: string
  id: string
  _parent?: ActorRefLike
  logic: { config: unknown }
  send(event: { type: string }): void
  getSnapshot(): unknown
}

/** The inspector calls this needs: `createBrowserInspector()` from @statelyai/inspect fits. */
export interface InspectorLike {
  actor(actor: ActorRefLike, snapshot?: { value?: unknown; status?: string }): void
  event(sessionId: string, event: { type: string }, info?: { source?: string }): void
  snapshot(
    sessionId: string,
    snapshot: { value?: unknown; status?: string },
    info?: { event?: { type: string } },
  ): void
}

type Tree = { [key: string]: Tree }
type Value = string | { [key: string]: Value | Tree }

/** Active leaf paths as an xstate state value: `['loading.first']` is `{ loading: 'first' }`. */
export function toXStateValue(leaves: string[]): Value {
  const tree: Tree = {}
  for (const leaf of leaves) {
    let t = tree
    for (const part of leaf.split('.')) t = t[part] ??= {}
  }
  const collapse = (t: Tree): Value => {
    const keys = Object.keys(t)
    if (keys.length === 1 && !Object.keys(t[keys[0]!]!).length) return keys[0]!
    return Object.fromEntries(keys.map(k => [k, Object.keys(t[k]!).length ? collapse(t[k]!) : {}]))
  }
  return collapse(tree)
}

type MachineClass = Parameters<typeof toXState>[0]

/** Registers `machine` with the inspector and streams it. Returns a function that disconnects. */
export function connectInspector(
  machine: Machine<unknown>,
  inspector: InspectorLike,
  options: { sessionId?: string; id?: string; parent?: ActorRefLike } = {},
): () => void {
  const sessionId = options.sessionId ?? `switchyard:${Math.random().toString(36).slice(2, 10)}`
  const snapshot = () => ({
    value: toXStateValue(machine.snapshot().configuration),
    status: machine.status,
  })
  const children = new Map<string, () => void>()
  const ref: ActorRefLike = {
    sessionId,
    id: options.id ?? sessionId,
    ...(options.parent ? { _parent: options.parent } : {}),
    logic: { config: toXState(machine.constructor as unknown as MachineClass) },
    send: e => machine.send(e.type),
    getSnapshot: snapshot,
  }

  inspector.actor(ref, snapshot())
  let last = JSON.stringify(snapshot())
  inspector.snapshot(sessionId, snapshot())
  const adopt = () => {
    for (const [id, child] of machine.actors)
      if (!children.has(id))
        children.set(
          id,
          connectInspector(child, inspector, { sessionId: `${sessionId}/${id}`, id, parent: ref }),
        )
  }
  const offInspect = machine.inspect(e => {
    if (e.type === '@xstate.event' && !e.event.type.startsWith('xstate.'))
      inspector.event(sessionId, { type: e.event.type })
  })
  // Subscribers also hear spawns, which change no state: send only real changes.
  const offSubscribe = machine.subscribe(() => {
    const next = snapshot()
    if (JSON.stringify(next) !== last) inspector.snapshot(sessionId, next)
    last = JSON.stringify(next)
    adopt()
  })
  adopt()
  return () => {
    offInspect()
    offSubscribe()
    for (const off of children.values()) off()
  }
}
