// An SCXML interpreter over a plain-data config. The algorithm, and most function names, are
// the W3C recommendation's Appendix D (https://www.w3.org/TR/scxml/#AlgorithmforSCXMLInterpretation).
// The decorator DSL compiles to this config; nothing here knows about classes or enums.

export interface EventObject {
  type: string
  [key: string]: unknown
}

export interface ActionApi {
  /** Queue on the internal queue: handled before any other external event. */
  raise(event: EventObject): void
  /** Queue on the external queue: handled once the current macrostep completes. */
  send(event: EventObject): void
}

export type Action = (event: EventObject, api: ActionApi) => void
export type Guard = (event: EventObject) => boolean

export interface TransitionConfig {
  /** Absolute dotted paths from the root: `'loading.retrying'`. None makes it targetless. */
  target?: string | string[]
  guard?: Guard
  actions?: Action[]
  /** Exit and re-enter the source even when every target is its descendant. */
  reenter?: boolean
}

export interface StateConfig {
  type?: 'parallel' | 'final' | 'history'
  /** A compound state's initial child key. Defaults to the first non-history child. */
  initial?: string
  /** For `type: 'history'`. Defaults to shallow. */
  history?: 'shallow' | 'deep'
  /** For `type: 'history'`: entered when nothing is recorded. Defaults to the parent's initial. */
  target?: string
  states?: Record<string, StateConfig>
  /**
   * Keys are event descriptors, as in xstate v5: an exact name, `'error.*'` for `error` and
   * every `error.…` event, or `'*'` for all. (SCXML's bare-prefix matching would make
   * `done.state.p` also match `done.state.p.r1`; SCXML import translates to this form.)
   */
  on?: Record<string, TransitionConfig | TransitionConfig[]>
  always?: TransitionConfig[]
  entry?: Action[]
  exit?: Action[]
}

export type MachineConfig = StateConfig

export type Status = 'idle' | 'active' | 'done' | 'stopped'

export interface Interpreter {
  readonly status: Status
  /** Active state paths in document order. */
  readonly configuration: string[]
  matches(path: string): boolean
  start(): this
  send(event: EventObject): this
  stop(): this
  /** Called after every macrostep that took a transition. Returns an unsubscribe function. */
  subscribe(listener: (interpreter: Interpreter) => void): () => void
}

type NodeType = 'atomic' | 'compound' | 'parallel' | 'final' | 'history'

interface Node {
  id: string
  type: NodeType
  parent: Node | undefined
  children: Node[]
  order: number
  entry: Action[]
  exit: Action[]
  transitions: Transition[]
  initial?: Node
  history?: 'shallow' | 'deep'
  /** A history state's default transition. */
  fallback?: Transition
}

interface Transition {
  source: Node
  /** Space-separated event descriptors; undefined for an eventless transition. */
  event: string | undefined
  targets: Node[]
  guard: Guard | undefined
  actions: Action[]
  reenter: boolean
}

export function createInterpreter(config: MachineConfig): Interpreter {
  const root = build(config)
  const configuration = new Set<Node>()
  const historyValue = new Map<Node, Node[]>()
  const internalQueue: EventObject[] = []
  const externalQueue: EventObject[] = []
  const listeners = new Set<(interpreter: Interpreter) => void>()
  let status: Status = 'idle'
  let processing = false
  let event: EventObject = { type: 'xstate.init' }
  let tookTransition = false

  const api: ActionApi = {
    raise: e => void internalQueue.push(e),
    send: e => void interpreter.send(e),
  }

  // SCXML 5.10.2: an error stops the rest of its block and raises error.execution.
  function run(actions: Action[]) {
    try {
      for (const action of actions) action(event, api)
    } catch (error) {
      internalQueue.push({ type: 'error.execution', error })
    }
  }

  const interpreter: Interpreter = {
    get status() {
      return status
    },
    get configuration() {
      return [...configuration].sort(byDocumentOrder).map(n => n.id)
    },
    matches(path) {
      return [...configuration].some(n => n.id === path)
    },
    start() {
      if (status !== 'idle') return this
      status = 'active'
      processing = true
      try {
        const targets = root.type === 'parallel' ? root.children.filter(isState) : [root.initial!]
        enterStates([transition(root, undefined, targets)])
        runToStable()
        notify()
        drain()
      } finally {
        processing = false
      }
      return this
    },
    send(e) {
      if (status === 'stopped' || status === 'done') return this
      externalQueue.push(e)
      if (status === 'active' && !processing) {
        processing = true
        try {
          drain()
        } finally {
          processing = false
        }
      }
      return this
    },
    stop() {
      if (status === 'active') {
        for (const s of [...configuration].sort(byExitOrder)) {
          run(s.exit)
          configuration.delete(s)
        }
      }
      status = 'stopped'
      externalQueue.length = internalQueue.length = 0
      return this
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }

  function notify() {
    for (const listener of [...listeners]) listener(interpreter)
  }

  function drain() {
    while (status === 'active' && externalQueue.length) {
      event = externalQueue.shift()!
      tookTransition = false
      const enabled = selectTransitions(event)
      if (enabled.length) microstep(enabled)
      runToStable()
      if (tookTransition) notify()
    }
  }

  // The inner loop of mainEventLoop: eventless transitions, then raised events, until stable.
  function runToStable() {
    while (status === 'active') {
      let enabled = selectTransitions(undefined)
      if (!enabled.length) {
        if (!internalQueue.length) return
        event = internalQueue.shift()!
        enabled = selectTransitions(event)
      }
      if (enabled.length) microstep(enabled)
    }
  }

  function selectTransitions(e: EventObject | undefined): Transition[] {
    const enabled = new Set<Transition>()
    const atomic = [...configuration].filter(s => s.type === 'atomic' || s.type === 'final')
    for (const state of atomic.sort(byDocumentOrder)) {
      for (const s of [state, ...properAncestors(state, undefined)]) {
        const t = s.transitions.find(
          t =>
            (e ? t.event !== undefined && matchesEvent(t.event, e.type) : t.event === undefined) &&
            (!t.guard || t.guard(e ?? event)),
        )
        if (t) {
          enabled.add(t)
          break
        }
      }
    }
    return removeConflictingTransitions([...enabled])
  }

  function removeConflictingTransitions(enabled: Transition[]): Transition[] {
    let filtered: Transition[] = []
    for (const t1 of enabled) {
      let preempted = false
      const toRemove = new Set<Transition>()
      const exit1 = computeExitSet([t1])
      for (const t2 of filtered) {
        if (![...computeExitSet([t2])].some(s => exit1.has(s))) continue
        if (isDescendant(t1.source, t2.source)) toRemove.add(t2)
        else {
          preempted = true
          break
        }
      }
      if (!preempted) filtered = [...filtered.filter(t => !toRemove.has(t)), t1]
    }
    return filtered
  }

  function microstep(enabled: Transition[]) {
    tookTransition = true
    exitStates(enabled)
    for (const t of enabled) run(t.actions)
    enterStates(enabled)
  }

  function exitStates(enabled: Transition[]) {
    const toExit = [...computeExitSet(enabled)].sort(byExitOrder)
    for (const s of toExit) {
      for (const h of s.children.filter(c => c.type === 'history')) {
        historyValue.set(
          h,
          [...configuration].filter(c =>
            h.history === 'deep' ? isAtomic(c) && isDescendant(c, s) : c.parent === s,
          ),
        )
      }
    }
    for (const s of toExit) {
      run(s.exit)
      configuration.delete(s)
    }
  }

  function computeExitSet(transitions: Transition[]): Set<Node> {
    const toExit = new Set<Node>()
    for (const t of transitions) {
      if (!t.targets.length) continue
      const domain = getTransitionDomain(t)
      for (const s of configuration) if (isDescendant(s, domain)) toExit.add(s)
    }
    return toExit
  }

  function enterStates(enabled: Transition[]) {
    const toEnter = new Set<Node>()
    for (const t of enabled) {
      for (const s of t.targets) addDescendantStatesToEnter(s, toEnter)
      const domain = getTransitionDomain(t)
      for (const s of getEffectiveTargetStates(t)) addAncestorStatesToEnter(s, domain, toEnter)
    }
    for (const s of [...toEnter].sort(byDocumentOrder)) {
      configuration.add(s)
      run(s.entry)
      if (s.type !== 'final') continue
      const parent = s.parent!
      if (parent === root) {
        status = 'done'
        continue
      }
      internalQueue.push({ type: `done.state.${parent.id}` })
      const grandparent = parent.parent!
      if (
        grandparent.type === 'parallel' &&
        grandparent.children.filter(isState).every(isInFinalState)
      ) {
        if (grandparent === root) status = 'done'
        else internalQueue.push({ type: `done.state.${grandparent.id}` })
      }
    }
  }

  function addDescendantStatesToEnter(state: Node, toEnter: Set<Node>) {
    if (state.type === 'history') {
      const recorded = historyValue.get(state)
      const targets = recorded ?? state.fallback!.targets
      if (!recorded) run(state.fallback!.actions)
      for (const s of targets) addDescendantStatesToEnter(s, toEnter)
      for (const s of targets) addAncestorStatesToEnter(s, state.parent!, toEnter)
      return
    }
    toEnter.add(state)
    if (state.type === 'compound') {
      addDescendantStatesToEnter(state.initial!, toEnter)
      addAncestorStatesToEnter(state.initial!, state, toEnter)
    } else if (state.type === 'parallel') {
      for (const child of state.children.filter(isState)) {
        if (![...toEnter].some(s => isDescendant(s, child)))
          addDescendantStatesToEnter(child, toEnter)
      }
    }
  }

  function addAncestorStatesToEnter(state: Node, ancestor: Node, toEnter: Set<Node>) {
    for (const anc of properAncestors(state, ancestor)) {
      if (anc === root) continue
      toEnter.add(anc)
      if (anc.type !== 'parallel') continue
      for (const child of anc.children.filter(isState)) {
        if (![...toEnter].some(s => isDescendant(s, child)))
          addDescendantStatesToEnter(child, toEnter)
      }
    }
  }

  function getTransitionDomain(t: Transition): Node {
    const targets = getEffectiveTargetStates(t)
    if (t.source === root) return root
    if (!t.reenter && t.source.type === 'compound' && targets.every(s => isDescendant(s, t.source)))
      return t.source
    return findLCCA([t.source, ...targets])
  }

  function getEffectiveTargetStates(t: Transition): Node[] {
    const targets = new Set<Node>()
    for (const s of t.targets) {
      if (s.type !== 'history') targets.add(s)
      else
        for (const h of historyValue.get(s) ?? getEffectiveTargetStates(s.fallback!)) targets.add(h)
    }
    return [...targets]
  }

  function isInFinalState(s: Node): boolean {
    if (s.type === 'compound')
      return s.children.some(c => c.type === 'final' && configuration.has(c))
    if (s.type === 'parallel') return s.children.filter(isState).every(isInFinalState)
    return false
  }

  return interpreter
}

function build(config: MachineConfig): Node {
  const byId = new Map<string, Node>()
  const pending: [Node, StateConfig][] = []
  let order = 0

  function node(cfg: StateConfig, key: string | undefined, parent: Node | undefined): Node {
    if (key?.includes('.')) throw new Error(`State key "${key}" cannot contain "."`)
    const id = parent?.id ? `${parent.id}.${key}` : (key ?? '')
    const keys = Object.keys(cfg.states ?? {})
    const n: Node = {
      id,
      type: cfg.type ?? (keys.length ? 'compound' : parent ? 'atomic' : 'compound'),
      parent,
      children: [],
      order: order++,
      entry: cfg.entry ?? [],
      exit: cfg.exit ?? [],
      transitions: [],
    }
    if (n.type === 'history') n.history = cfg.history ?? 'shallow'
    byId.set(id, n)
    n.children = keys.map(k => node(cfg.states![k]!, k, n))
    if (n.type === 'compound') {
      const initial = cfg.initial ?? keys.find(k => cfg.states![k]!.type !== 'history')
      n.initial = n.children.find(c => c.id.split('.').pop() === initial)
      if (!n.initial) throw new Error(`State "${id || '(root)'}" has no initial state "${initial}"`)
    }
    pending.push([n, cfg])
    return n
  }

  const resolve = (from: Node, target: string | string[] | undefined) =>
    [target ?? []].flat().map(path => {
      const t = byId.get(path)
      if (!t) throw new Error(`State "${from.id}" targets unknown state "${path}"`)
      return t
    })

  const root = node(config, undefined, undefined)
  for (const [n, cfg] of pending) {
    const make = (event: string | undefined, t: TransitionConfig): Transition => ({
      source: n,
      event,
      targets: resolve(n, t.target),
      guard: t.guard,
      actions: t.actions ?? [],
      reenter: t.reenter ?? false,
    })
    for (const [event, ts] of Object.entries(cfg.on ?? {}))
      for (const t of [ts].flat()) n.transitions.push(make(event, t))
    for (const t of cfg.always ?? []) n.transitions.push(make(undefined, t))
    if (n.type === 'history')
      n.fallback = transition(
        n,
        undefined,
        cfg.target ? resolve(n, cfg.target) : [n.parent!.initial!],
      )
  }
  return root
}

function transition(source: Node, event: string | undefined, targets: Node[]): Transition {
  return { source, event, targets, guard: undefined, actions: [], reenter: false }
}

function matchesEvent(descriptors: string, type: string): boolean {
  return descriptors.split(/\s+/).some(d => {
    if (d === '*' || d === type) return true
    if (!d.endsWith('.*')) return false
    const prefix = d.slice(0, -2)
    return type === prefix || type.startsWith(`${prefix}.`)
  })
}

const isState = (n: Node) => n.type !== 'history'
const isAtomic = (n: Node) => n.type === 'atomic' || n.type === 'final'
const byDocumentOrder = (a: Node, b: Node) => a.order - b.order
const byExitOrder = (a: Node, b: Node) => b.order - a.order

function isDescendant(s: Node, ancestor: Node): boolean {
  for (let p = s.parent; p; p = p.parent) if (p === ancestor) return true
  return false
}

/** Ancestors of `s`, innermost first, stopping before `stop` (or after the root). */
function properAncestors(s: Node, stop: Node | undefined): Node[] {
  const out: Node[] = []
  for (let p = s.parent; p && p !== stop; p = p.parent) out.push(p)
  return out
}

function findLCCA(states: Node[]): Node {
  const [head, ...rest] = states
  for (const anc of properAncestors(head!, undefined)) {
    if (anc.type !== 'compound' && anc.parent) continue
    if (rest.every(s => isDescendant(s, anc))) return anc
  }
  return head!.parent!
}
