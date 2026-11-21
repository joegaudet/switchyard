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
  /** Deliver to an invoked actor by id: a child machine's `send`, or a callback actor's `receive`. */
  sendTo(id: string, event: EventObject): void
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
  /** Delayed transitions, keyed by milliseconds; cancelled if the state exits first. */
  after?: Record<number, TransitionConfig | TransitionConfig[]>
  /** Actors that run while this state is active. */
  invoke?: InvokeConfig[]
}

export interface InvokeInput {
  /** Aborted when the invoking state exits. */
  signal: AbortSignal
  /** Send an event to the invoking machine. Ignored once the state has exited. */
  sendBack(event: EventObject): void
  /** Listen for events sent to this actor with `sendTo`. */
  receive(listener: (event: EventObject) => void): void
  /** The event that entered the invoking state. */
  event: EventObject
}

export interface Observer {
  next(value: unknown): void
  error(error: unknown): void
  complete(): void
}

export interface Subscribable {
  subscribe(observer: Observer): { unsubscribe(): void }
}

export interface InvokeConfig {
  /** Defaults to `<state path>:invocation[<index>]`. */
  id?: string
  /**
   * Starts the actor. What it returns decides the kind: a promise (done with its value, or an
   * error), an Interpreter (a child machine, done when it reaches a final state), a
   * Subscribable (values arrive as `xstate.snapshot.<id>`, then done), or a cleanup function
   * (a callback actor).
   */
  src(input: InvokeInput): unknown
  /** A child machine's output for its done event. */
  output?(): unknown
  /** Taken on `xstate.done.actor.<id>`; the event carries `output`. */
  onDone?: TransitionConfig
  /** Taken on `xstate.error.actor.<id>`; the event carries `error`. */
  onError?: TransitionConfig
}

export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export type InspectionEvent =
  | { type: '@xstate.event'; event: EventObject }
  | {
      type: '@xstate.microstep'
      event: EventObject
      transitions: { source: string; targets: string[] }[]
    }
  | { type: '@xstate.snapshot'; configuration: string[]; status: Status }

export type MachineConfig = StateConfig

export type Status = 'idle' | 'active' | 'done' | 'stopped'

export interface Interpreter {
  readonly status: Status
  /** Active state paths in document order. */
  readonly configuration: string[]
  matches(path: string): boolean
  /** Whether `event` would take a transition now, guards included. */
  can(event: EventObject): boolean
  start(): this
  send(event: EventObject): this
  stop(): this
  /** Called after every macrostep that took a transition. Returns an unsubscribe function. */
  subscribe(listener: (interpreter: Interpreter) => void): () => void
  /** Streams events, microsteps and snapshots. Returns an unsubscribe function. */
  inspect(listener: (event: InspectionEvent) => void): () => void
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
  delays: number[]
  invokes: { id: string; config: InvokeConfig }[]
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

export interface InterpreterOptions {
  /** Called for an external event that no transition handles. */
  onUnhandled?(event: EventObject): void
  /** Timers for `after`. Defaults to the global setTimeout; tests pass `manualClock()`. */
  clock?: Clock
}

const realClock: Clock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

interface Actor {
  node: Node
  stop(): void
  send(event: EventObject): void
}

export function createInterpreter(
  config: MachineConfig,
  options: InterpreterOptions = {},
): Interpreter {
  const root = build(config)
  const configuration = new Set<Node>()
  const historyValue = new Map<Node, Node[]>()
  const internalQueue: EventObject[] = []
  const externalQueue: EventObject[] = []
  const listeners = new Set<(interpreter: Interpreter) => void>()
  const inspectors = new Set<(event: InspectionEvent) => void>()
  const clock = options.clock ?? realClock
  const timers = new Map<Node, unknown[]>()
  const actors = new Map<string, Actor>()
  const toInvoke = new Set<Node>()
  let status: Status = 'idle'
  let processing = false
  let event: EventObject = { type: 'xstate.init' }
  let tookTransition = false
  // A function, not an inline comparison: actions can stop the machine mid-call, which
  // TypeScript's narrowing of `status` cannot see.
  const stopped = () => status === 'stopped'

  const api: ActionApi = {
    raise: e => void internalQueue.push(e),
    send: e => void interpreter.send(e),
    sendTo: (id, e) => {
      const actor = actors.get(id)
      if (actor) actor.send(e)
      else internalQueue.push({ type: 'error.communication', id, event: e })
    },
  }

  function inspect(e: InspectionEvent) {
    for (const listener of [...inspectors]) listener(e)
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
    can(e) {
      return status === 'active' && selectTransitions(e).length > 0
    },
    start() {
      if (status !== 'idle') return this
      status = 'active'
      processing = true
      try {
        run(root.entry)
        const targets = root.type === 'parallel' ? root.children.filter(isState) : [root.initial!]
        enterStates([transition(root, undefined, targets)])
        runToStable()
        endMacrostep()
        if (!stopped()) notify()
        drain()
      } finally {
        processing = false
        if (stopped()) exitAll()
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
          if (stopped()) exitAll()
        }
      }
      return this
    },
    // Stopping mid-step (from an action or a listener) ends the step where it stands; the
    // remaining states exit once control is back at the step boundary, as SCXML's exitInterpreter.
    stop() {
      const wasActive = status === 'active'
      status = 'stopped'
      if (wasActive && !processing) exitAll()
      else halt()
      return this
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    inspect(listener) {
      inspectors.add(listener)
      return () => void inspectors.delete(listener)
    },
  }

  function exitAll() {
    processing = true
    try {
      for (const s of [...configuration].sort(byExitOrder)) {
        cancel(s)
        configuration.delete(s)
        run(s.exit)
      }
      run(root.exit)
    } finally {
      processing = false
      halt()
    }
  }

  function notify() {
    inspect({ type: '@xstate.snapshot', configuration: interpreter.configuration, status })
    for (const listener of [...listeners]) listener(interpreter)
  }

  // Timers and actors belong to states; once nothing is active they all go.
  function halt() {
    for (const handles of timers.values()) for (const h of handles) clock.clearTimeout(h)
    timers.clear()
    for (const actor of [...actors.values()]) actor.stop()
    actors.clear()
    toInvoke.clear()
    externalQueue.length = internalQueue.length = 0
  }

  // SCXML: invokes start at the end of the macrostep, for entered states still active.
  function endMacrostep() {
    if (stopped()) return
    if (status === 'done') return halt()
    const states = [...toInvoke].sort(byDocumentOrder)
    toInvoke.clear()
    for (const s of states)
      if (configuration.has(s)) for (const inv of s.invokes) startActor(s, inv.id, inv.config)
  }

  function startActor(node: Node, id: string, config: InvokeConfig) {
    const controller = new AbortController()
    const receivers: ((e: EventObject) => void)[] = []
    let stop = () => {}
    let send = (e: EventObject) => receivers.forEach(r => r(e))
    const live = () => !controller.signal.aborted && actors.get(id) === actor
    const finish = (e: EventObject) => {
      if (!live()) return
      actors.delete(id)
      interpreter.send(e)
    }
    const done = (output: unknown) => finish({ type: `xstate.done.actor.${id}`, output })
    const fail = (error: unknown) => finish({ type: `xstate.error.actor.${id}`, error })
    const actor: Actor = {
      node,
      stop: () => {
        controller.abort()
        stop()
      },
      send: e => send(e),
    }
    actors.set(id, actor)
    let result: unknown
    try {
      result = config.src({
        signal: controller.signal,
        sendBack: e => void (live() && interpreter.send(e)),
        receive: r => void receivers.push(r),
        event,
      })
    } catch (error) {
      return fail(error)
    }
    if (isInterpreter(result)) {
      const child = result
      send = e => void child.send(e)
      stop = () => void child.stop()
      const off = child.subscribe(c => {
        if (c.status !== 'done') return
        off()
        done(config.output?.())
      })
      child.start()
      if (child.status === 'done') done(config.output?.())
    } else if (isThenable(result)) {
      result.then(done, fail)
    } else if (isSubscribable(result)) {
      const sub = result.subscribe({
        next: snapshot =>
          void (live() && interpreter.send({ type: `xstate.snapshot.${id}`, snapshot })),
        error: fail,
        complete: () => done(undefined),
      })
      stop = () => sub.unsubscribe()
    } else if (typeof result === 'function') {
      stop = result as () => void
    }
  }

  function cancel(s: Node) {
    for (const h of timers.get(s) ?? []) clock.clearTimeout(h)
    timers.delete(s)
    toInvoke.delete(s)
    for (const [id, actor] of actors) {
      if (actor.node !== s) continue
      actors.delete(id)
      actor.stop()
    }
  }

  function drain() {
    while (status === 'active' && externalQueue.length) {
      event = externalQueue.shift()!
      inspect({ type: '@xstate.event', event })
      tookTransition = false
      const enabled = selectTransitions(event)
      if (enabled.length) microstep(enabled)
      else options.onUnhandled?.(event)
      runToStable()
      endMacrostep()
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
        inspect({ type: '@xstate.event', event })
        enabled = selectTransitions(event)
      }
      if (enabled.length) microstep(enabled)
    }
  }

  // SCXML 5.9: a condition that throws is false, and raises error.execution.
  function passes(t: Transition, e: EventObject): boolean {
    if (!t.guard) return true
    try {
      return t.guard(e)
    } catch (error) {
      internalQueue.push({ type: 'error.execution', error })
      return false
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
            passes(t, e ?? event),
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
    if (inspectors.size)
      inspect({
        type: '@xstate.microstep',
        event,
        transitions: enabled.map(t => ({ source: t.source.id, targets: t.targets.map(n => n.id) })),
      })
    exitStates(enabled)
    for (const t of enabled) if (status === 'active') run(t.actions)
    if (status === 'active') enterStates(enabled)
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
      if (stopped()) return
      cancel(s)
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
      // SCXML's domain is never parallel; a parallel root re-enters any region left out.
      if (domain === root && root.type === 'parallel') addMissingRegions(root, toEnter)
    }
    for (const s of [...toEnter].sort(byDocumentOrder)) {
      if (stopped()) return
      configuration.add(s)
      if (s.invokes.length) toInvoke.add(s)
      if (s.delays.length)
        timers.set(
          s,
          s.delays.map(ms =>
            clock.setTimeout(() => interpreter.send({ type: afterEvent(ms, s) }), ms),
          ),
        )
      run(s.entry)
      if (s.type !== 'final') continue
      const parent = s.parent!
      if (parent === root) {
        status = 'done'
        continue
      }
      internalQueue.push({ type: `done.state.${parent.id}` })
      // Appendix D checks only the grandparent; a parallel nested in a parallel needs the chain.
      for (
        let anc = parent.parent;
        anc?.type === 'parallel' && isInFinalState(anc);
        anc = anc.parent
      ) {
        if (anc === root) {
          status = 'done'
          break
        }
        internalQueue.push({ type: `done.state.${anc.id}` })
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
    } else if (state.type === 'parallel') addMissingRegions(state, toEnter)
  }

  function addMissingRegions(state: Node, toEnter: Set<Node>) {
    for (const child of state.children.filter(isState)) {
      if (![...toEnter].some(s => isDescendant(s, child)))
        addDescendantStatesToEnter(child, toEnter)
    }
  }

  function addAncestorStatesToEnter(state: Node, ancestor: Node, toEnter: Set<Node>) {
    for (const anc of properAncestors(state, ancestor)) {
      if (anc === root) continue
      toEnter.add(anc)
      if (anc.type === 'parallel') addMissingRegions(anc, toEnter)
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
      delays: Object.keys(cfg.after ?? {}).map(Number),
      invokes: (cfg.invoke ?? []).map((config, i) => ({
        id: config.id ?? `${id || '(root)'}:invocation[${i}]`,
        config,
      })),
    }
    if (n.type === 'history') n.history = cfg.history ?? 'shallow'
    byId.set(id, n)
    n.children = keys.map(k => node(cfg.states![k]!, k, n))
    if (n.type === 'compound') {
      const initial = cfg.initial ?? keys.find(k => cfg.states![k]!.type !== 'history')
      n.initial = n.children.find(c => c.id.split('.').pop() === initial)
      if (!n.initial) throw new Error(`State "${id || '(root)'}" has no initial state "${initial}"`)
      if (n.initial.type === 'history' && !cfg.states![initial!]!.target)
        throw new Error(`State "${id || '(root)'}": an initial history state needs a target`)
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
    for (const [ms, ts] of Object.entries(cfg.after ?? {}))
      for (const t of [ts].flat()) n.transitions.push(make(afterEvent(Number(ms), n), t))
    for (const { id, config: inv } of n.invokes) {
      if (inv.onDone) n.transitions.push(make(`xstate.done.actor.${id}`, inv.onDone))
      if (inv.onError) n.transitions.push(make(`xstate.error.actor.${id}`, inv.onError))
    }
    if (n.type === 'history')
      n.fallback = transition(
        n,
        undefined,
        cfg.target
          ? resolve(n, cfg.target)
          : n.parent!.type === 'parallel'
            ? n.parent!.children.filter(isState)
            : [n.parent!.initial!],
      )
  }
  return root
}

const afterEvent = (ms: number, n: Node) => `xstate.after.${ms}.${n.id || '(root)'}`

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  typeof (v as PromiseLike<unknown> | null)?.then === 'function'
const isSubscribable = (v: unknown): v is Subscribable =>
  typeof (v as Subscribable | null)?.subscribe === 'function'
const isInterpreter = (v: unknown): v is Interpreter => {
  const i = v as Partial<Interpreter> | null
  return ['start', 'send', 'subscribe'].every(
    k => typeof i?.[k as keyof Interpreter] === 'function',
  )
}

/** A clock that only moves when told to: `clock.advance(ms)` fires every timer that falls due. */
export function manualClock() {
  let now = 0
  let next = 0
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    get now() {
      return now
    },
    get pending() {
      return timers.size
    },
    setTimeout(fn: () => void, ms: number) {
      timers.set(++next, { at: now + ms, fn })
      return next
    },
    clearTimeout(handle: unknown) {
      timers.delete(handle as number)
    },
    advance(ms: number) {
      const end = now + ms
      for (;;) {
        let due: [number, { at: number; fn: () => void }] | undefined
        for (const entry of timers)
          if (entry[1].at <= end && (!due || entry[1].at < due[1].at)) due = entry
        if (!due) break
        timers.delete(due[0])
        now = due[1].at
        due[1].fn()
      }
      now = end
    },
  } satisfies Clock & Record<string, unknown>
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
