// The diagram model, read from a machine config. Labels come from the names the compiler gives
// guards and actions (see core's `named`), so hand-written configs label the same way.
import type { Machine, MachineConfig, StateConfig, TransitionConfig } from '@switchyard/core'

export type StateType = 'atomic' | 'compound' | 'parallel' | 'final' | 'history'

export interface GraphState {
  /** The state's path, `''` for the root. */
  id: string
  key: string
  type: StateType
  /** A compound state's initial child, by id. */
  initial?: string
  /** For history states. */
  history?: 'shallow' | 'deep'
  entry: string[]
  exit: string[]
  /** Ids of the actors this state invokes. */
  invoke: string[]
  children: GraphState[]
}

export interface GraphTransition {
  source: string
  /** Undefined for a targetless transition. */
  target?: string
  /** The event as written: a method name, `always`, `after 5000ms`, `done: load`, `error: load`. */
  event: string
  guard?: string
  actions: string[]
  /** `event [guard] / actions`, leaving out an action named after its own event. */
  label: string
}

export interface Graph {
  name: string
  root: GraphState
  transitions: GraphTransition[]
}

export type MachineClass = (abstract new (...args: never[]) => Machine<unknown>) & {
  toConfig(): MachineConfig
}

/** The graph of a Machine class, or of a plain interpreter config. */
export function toGraph(input: MachineClass | MachineConfig, name?: string): Graph {
  const isClass = typeof input === 'function'
  const config = isClass ? input.toConfig() : input
  const transitions: GraphTransition[] = []

  const walk = (cfg: StateConfig, key: string, id: string): GraphState => {
    const keys = Object.keys(cfg.states ?? {})
    const type: StateType = cfg.type ?? (keys.length || !id ? 'compound' : 'atomic')
    const child = (k: string) => (id ? `${id}.${k}` : k)
    const state: GraphState = {
      id,
      key,
      type,
      entry: (cfg.entry ?? []).map(a => a.name),
      exit: (cfg.exit ?? []).map(a => a.name),
      invoke: (cfg.invoke ?? []).map((inv, i) => inv.id ?? `${id || '(root)'}:invocation[${i}]`),
      children: [],
    }
    if (type === 'history') state.history = cfg.history ?? 'shallow'
    if (type === 'compound' && keys.length) {
      const initial = cfg.initial ?? keys.find(k => cfg.states![k]!.type !== 'history')
      if (initial) state.initial = child(initial)
    }

    const add = (event: string, t: TransitionConfig) => {
      const actions = (t.actions ?? []).map(a => a.name).filter(a => a && a !== event)
      const guard = t.guard?.name || undefined
      const target = [t.target ?? []].flat()[0]
      transitions.push({
        source: id,
        ...(target !== undefined ? { target } : {}),
        event,
        ...(guard ? { guard } : {}),
        actions,
        label: `${event}${guard ? ` [${guard}]` : ''}${actions.length ? ` / ${actions.join(', ')}` : ''}`,
      })
    }
    for (const [event, ts] of Object.entries(cfg.on ?? {}))
      for (const t of [ts].flat()) add(event, t)
    for (const t of cfg.always ?? []) add('always', t)
    for (const [ms, ts] of Object.entries(cfg.after ?? {}))
      for (const t of [ts].flat()) add(`after ${ms}ms`, t)
    ;(cfg.invoke ?? []).forEach((inv, i) => {
      if (inv.onDone) add(`done: ${state.invoke[i]}`, inv.onDone)
      if (inv.onError) add(`error: ${state.invoke[i]}`, inv.onError)
    })

    state.children = keys.map(k => walk(cfg.states![k]!, k, child(k)))
    return state
  }

  const root = walk(config, '', '')
  return { name: name ?? (isClass ? input.name : 'machine'), root, transitions }
}

/** Every state in document order, the root first. */
export function states(graph: Graph): GraphState[] {
  const out: GraphState[] = []
  const visit = (s: GraphState) => {
    out.push(s)
    s.children.forEach(visit)
  }
  visit(graph.root)
  return out
}

export interface MachineInterface {
  name: string
  /** Events (the machine's event methods) and the states that handle them. */
  events: { name: string; from: string[] }[]
  guards: string[]
  /** Entry, exit and eventless/delayed actions, with where they run. */
  actions: { name: string; on: string }[]
  invokes: { id: string; state: string }[]
}

const internal = (event: string) => /^(always|after |done: |error: )/.test(event)

/**
 * The machine's interface: what you can call, what it checks, what it runs. Payload types exist
 * only at compile time; the build-time CLI adds them.
 */
export function describeInterface(
  input: MachineClass | MachineConfig,
  name?: string,
): MachineInterface {
  const graph = toGraph(input, name)
  const events = new Map<string, string[]>()
  const guards = new Set<string>()
  const actions: MachineInterface['actions'] = []
  for (const t of graph.transitions) {
    if (t.guard) guards.add(t.guard)
    if (internal(t.event)) {
      for (const a of t.actions)
        actions.push({ name: a, on: `${t.event} in ${t.source || '(root)'}` })
      continue
    }
    events.set(t.event, [...(events.get(t.event) ?? []), t.source || '*'])
  }
  for (const s of states(graph)) {
    for (const a of s.entry) actions.push({ name: a, on: `entry ${s.id || '(root)'}` })
    for (const a of s.exit) actions.push({ name: a, on: `exit ${s.id || '(root)'}` })
  }
  return {
    name: graph.name,
    events: [...events].map(([n, from]) => ({ name: n, from })),
    guards: [...guards],
    actions,
    invokes: states(graph).flatMap(s => s.invoke.map(id => ({ id, state: s.id }))),
  }
}

export interface ActorNode {
  id: string
  machine: string
  /** Active state paths. */
  configuration: string[]
  children: ActorNode[]
}

/** The live actor tree under `machine`: its running spawned and invoked child machines. */
export function topology(machine: Machine<unknown>, id = '(root)'): ActorNode {
  return {
    id,
    machine: machine.constructor.name,
    configuration: machine.snapshot().configuration,
    children: [...machine.actors].map(([childId, child]) => topology(child, childId)),
  }
}
