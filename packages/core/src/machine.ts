// The decorator DSL. A Machine subclass is compiled, per instance, into the interpreter's
// plain-data config: its State enums become the state tree, its decorated methods the
// transitions and actions. Decorators work in both modes Ember apps meet: TC39 standard
// (recorded on `context.metadata`) and legacy/experimentalDecorators (recorded per prototype).
import type { EnumClass } from '@real-enums/core'
import type { State } from './state.js'
import {
  createInterpreter,
  manualClock,
  type Snapshot,
  type Action,
  type Clock,
  type InspectionEvent,
  type InvokeConfig,
  type EventObject,
  type Interpreter,
  type MachineConfig,
  type StateConfig,
  type TransitionConfig,
} from './interpreter.js'

// TC39 decorator metadata, where the runtime has not shipped it yet. esbuild and TypeScript
// both read `Symbol.metadata` (esbuild falls back to this same registered symbol).
;(Symbol as { metadata?: symbol }).metadata ??= Symbol.for('Symbol.metadata')

/** A guard: the name of a getter on the machine, or a combination of them. */
export type GuardRef = string | { and: GuardRef[] } | { or: GuardRef[] } | { not: GuardRef }

export const and = (...guards: GuardRef[]): GuardRef => ({ and: guards })
export const or = (...guards: GuardRef[]): GuardRef => ({ or: guards })
export const not = (guard: GuardRef): GuardRef => ({ not: guard })

/** A transition target that resumes a compound state's history: `to: history(S.Editing)`. */
export class HistoryTarget {
  constructor(readonly state: State) {}
}
export const history = (state: State) => {
  if (!state.history)
    throw new Error(`${describe(state)} has no history; declare one with { history }`)
  return new HistoryTarget(state)
}

export interface TransitionOptions {
  /** The source state(s). Omitted, every state handles the event. */
  from?: State | State[]
  /** Omitted, the transition only runs its body. */
  to?: State | HistoryTarget
  guard?: GuardRef
  /** Exit and re-enter the source even when the target is its descendant. */
  reenter?: boolean
  /** The region, when a state's enum is used by more than one `@region`. */
  in?: string
}

type Fn = (this: unknown, ...args: unknown[]) => unknown

export interface InvokeOptions {
  /** Defaults to the method name. */
  id?: string
  /** Registers an invoked machine in the system: `this.system.get(systemId)`. */
  systemId?: string
  /** Taken when the method's promise resolves, or its child machine finishes. */
  onDone?: State
  /** Taken when the method throws or its promise rejects. */
  onError?: State
  in?: string
}

type Decoration =
  | { kind: 'transition'; key: string; options: TransitionOptions; body: Fn }
  | { kind: 'always'; key: string; options: TransitionOptions }
  | { kind: 'entry' | 'exit'; key: string; state: State; in: string | undefined }
  | { kind: 'region'; key: string; states: EnumClass<State> }
  | { kind: 'after'; key: string; ms: number; options: TransitionOptions }
  | { kind: 'invoke'; key: string; state: State; invoke: InvokeOptions }

const DECORATIONS = Symbol('switchyard.decorations')
const BODY = Symbol('switchyard.body')
const legacy = new WeakMap<object, Decoration[]>()

function own(holder: Record<PropertyKey, unknown>): Decoration[] {
  if (!Object.hasOwn(holder, DECORATIONS)) holder[DECORATIONS] = []
  return holder[DECORATIONS] as Decoration[]
}

function legacyList(prototype: object): Decoration[] {
  let list = legacy.get(prototype)
  if (!list) legacy.set(prototype, (list = []))
  return list
}

// Stacked decorators apply bottom-up; record them top-down, so source order is document order.
function record(list: Decoration[], d: Decoration) {
  let at = list.length
  while (at > 0 && list[at - 1]!.key === d.key && list[at - 1]!.kind === d.kind) at--
  list.splice(at, 0, d)
}

type Standard = { kind: string; name: string | symbol; metadata: object }
const isStandard = (c: unknown): c is Standard => typeof c === 'object' && c !== null

export interface MethodDecorator {
  <This, A extends unknown[], R>(
    target: (this: This, ...args: A) => R,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: A) => R>,
  ): (this: This, ...args: A) => R
  (prototype: object, key: string, descriptor: PropertyDescriptor): PropertyDescriptor
}

function methodDecorator(
  make: (key: string, body: Fn) => Decoration,
  sends: boolean,
): MethodDecorator {
  return ((target: unknown, context: unknown, descriptor?: PropertyDescriptor) => {
    const standard = isStandard(context)
    const key = String(standard ? context.name : context)
    const fn = (standard ? target : descriptor!.value) as Fn & { [BODY]?: Fn }
    const body = fn[BODY] ?? fn
    record(
      standard
        ? own(context.metadata as Record<PropertyKey, unknown>)
        : legacyList(target as object),
      make(key, body),
    )
    if (!sends) return standard ? undefined : descriptor
    const sender = Object.assign(
      function (this: Machine, ...args: unknown[]) {
        this.send(key, ...args)
      },
      { [BODY]: body },
    )
    return standard ? sender : { ...descriptor, value: sender }
  }) as MethodDecorator
}

/** Makes the method an event: calling it sends the event, and its body runs as the action. */
export const transition = (options: TransitionOptions = {}) =>
  methodDecorator((key, body) => ({ kind: 'transition', key, options, body }), true)

/** An eventless transition, taken as soon as its guard holds. The method runs as its action. */
export const always = (options: TransitionOptions) =>
  methodDecorator(key => ({ kind: 'always', key, options }), false)

export const onEntry = (state: State, options: { in?: string } = {}) =>
  methodDecorator(key => ({ kind: 'entry', key, state, in: options.in }), false)

export const onExit = (state: State, options: { in?: string } = {}) =>
  methodDecorator(key => ({ kind: 'exit', key, state, in: options.in }), false)

/** A delayed transition, on the machine's clock; the method runs as its action. */
export const after = (ms: number, options: TransitionOptions) =>
  methodDecorator(key => ({ kind: 'after', key, ms, options }), false)

/**
 * Runs the method while `state` is active, passing an AbortSignal that aborts on exit. What
 * it returns decides the actor: a promise, a child Machine, a Subscribable, or a cleanup function.
 */
export const invoke = (state: State, options: InvokeOptions = {}) =>
  methodDecorator(key => ({ kind: 'invoke', key, state, invoke: options }), false)

export interface RegionDecorator {
  <This, V>(
    target: ClassAccessorDecoratorTarget<This, V>,
    context: ClassAccessorDecoratorContext<This, V>,
  ): ClassAccessorDecoratorResult<This, V>
  // Legacy: a `declare` field; Babel defines the descriptor this returns.
  (prototype: object, key: string, descriptor?: PropertyDescriptor): void
}

/** A parallel region, its states from `states`: `@region(Toggle) accessor bold!: Toggle`. */
export function region(states: EnumClass<State>): RegionDecorator {
  return ((target: unknown, context: unknown) => {
    const standard = isStandard(context)
    const key = String(standard ? context.name : context)
    const d: Decoration = { kind: 'region', key, states }
    function get(this: Machine<Record<string, State>>) {
      return this.state[key]
    }
    if (standard) {
      own(context.metadata as Record<PropertyKey, unknown>).push(d)
      return { get }
    }
    legacyList(target as object).push(d)
    const descriptor = { configurable: true, enumerable: false, get }
    // TypeScript's legacy field decorators ignore the return value; Babel's use it.
    Object.defineProperty(target, key, descriptor)
    return descriptor
  }) as RegionDecorator
}

function decorationsOf(ctor: typeof Machine): Decoration[] {
  const chain: (typeof Machine)[] = []
  for (let c = ctor; c !== Machine; c = Object.getPrototypeOf(c)) chain.unshift(c)
  return chain.flatMap(c => {
    // Own only: an undecorated subclass inherits its parent's metadata as a static.
    const meta = Object.hasOwn(c, Symbol.metadata!)
      ? (c as unknown as Record<symbol, Record<PropertyKey, unknown> | null>)[Symbol.metadata!]
      : null
    return [
      ...(meta && Object.hasOwn(meta, DECORATIONS) ? (meta[DECORATIONS] as Decoration[]) : []),
      ...(legacy.get(c.prototype) ?? []),
    ]
  })
}

const dev =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    'NODE_ENV'
  ] !== 'production'
const describe = (s: State) => `${s.constructor.name}.${s.value}`

interface Compiled {
  config: MachineConfig
  /** Each state value's path(s): one per region that uses its enum. */
  paths: Map<State, string[]>
  /** The root enum, or the regions' names and enums. */
  root: EnumClass<State> | [string, EnumClass<State>][]
}

function compile(ctor: typeof Machine, self: object | undefined): Compiled {
  const decorations = decorationsOf(ctor)
  const paths = new Map<State, string[]>()
  const nodes = new Map<string, StateConfig>()

  function tree(states: EnumClass<State>, prefix: string): Record<string, StateConfig> {
    const out: Record<string, StateConfig> = {}
    for (const s of states.values as State[]) {
      const path = prefix ? `${prefix}.${s.value}` : s.value
      paths.set(s, [...(paths.get(s) ?? []), path])
      const node: StateConfig = s.final ? { type: 'final' } : {}
      if (s.children) node.states = tree(s.children, path)
      if (s.history) node.states!['$history'] = { type: 'history', history: s.history }
      nodes.set(path, node)
      out[s.value] = node
    }
    return out
  }

  const regions = decorations.filter(d => d.kind === 'region')
  let config: MachineConfig
  let root: Compiled['root']
  if (regions.length) {
    root = regions.map(r => [r.key, r.states])
    config = {
      type: 'parallel',
      states: Object.fromEntries(root.map(([k, s]) => [k, { states: tree(s, k) }])),
    }
    for (const [k] of root) nodes.set(k, config.states![k]!)
  } else {
    root = rootEnum(ctor, decorations)
    config = { states: tree(root, '') }
  }
  nodes.set('', config)

  const name = ctor.name
  const pathOf = (s: State, region: string | undefined): string => {
    const all = (paths.get(s) ?? []).filter(
      p => !region || p === region || p.startsWith(`${region}.`),
    )
    if (all.length === 1) return all[0]!
    if (!all.length)
      throw new Error(
        `${name}: ${describe(s)} is not one of its states${region ? ` in region "${region}"` : ''}`,
      )
    throw new Error(
      `${name}: ${describe(s)} is in regions ${all.map(p => p.split('.')[0]).join(', ')}; name one with { in }`,
    )
  }
  const nodeAt = (path: string) => nodes.get(path)!

  const guardOf = (ref: GuardRef): ((e: EventObject) => boolean) => {
    if (typeof ref === 'string') {
      if (!(ref in ctor.prototype))
        throw new Error(`${name}: guard "${ref}" is not a getter on the class`)
      return () => Boolean((self as Record<string, unknown> | undefined)?.[ref])
    }
    if ('and' in ref) {
      const gs = ref.and.map(guardOf)
      return e => gs.every(g => g(e))
    }
    if ('or' in ref) {
      const gs = ref.or.map(guardOf)
      return e => gs.some(g => g(e))
    }
    const g = guardOf(ref.not)
    return e => !g(e)
  }

  const call =
    (key: string): Action =>
    () =>
      void (self as unknown as Record<string, () => unknown>)?.[key]?.()

  const transitionConfig = (options: TransitionOptions, action: Action): TransitionConfig => {
    const { to } = options
    const target =
      to instanceof HistoryTarget
        ? `${pathOf(to.state, options.in)}.$history`
        : to
          ? pathOf(to, options.in)
          : undefined
    return {
      ...(target ? { target } : {}),
      ...(options.guard ? { guard: guardOf(options.guard) } : {}),
      ...(options.reenter ? { reenter: true } : {}),
      actions: [action],
    }
  }

  const sources = (options: TransitionOptions) =>
    options.from ? [options.from].flat().map(s => nodeAt(pathOf(s, options.in))) : [config]

  for (const d of decorations) {
    if (d.kind === 'transition') {
      const action: Action = event => {
        const result = d.body.apply(self, (event['args'] as unknown[]) ?? [])
        if (dev && typeof (result as Promise<unknown>)?.then === 'function')
          console.warn(
            `${name}: event "${d.key}" returned a promise; run async work in @invoke or @onEntry`,
          )
      }
      for (const node of sources(d.options)) {
        const on = (node.on ??= {})
        on[d.key] = [...[on[d.key] ?? []].flat(), transitionConfig(d.options, action)]
      }
    } else if (d.kind === 'always') {
      for (const node of sources(d.options))
        (node.always ??= []).push(transitionConfig(d.options, call(d.key)))
    } else if (d.kind === 'entry' || d.kind === 'exit') {
      const node = nodeAt(pathOf(d.state, d.in))
      ;(node[d.kind] ??= []).push(call(d.key))
    } else if (d.kind === 'after') {
      for (const node of sources(d.options)) {
        const after = (node.after ??= {})
        after[d.ms] = [...[after[d.ms] ?? []].flat(), transitionConfig(d.options, call(d.key))]
      }
    } else if (d.kind === 'invoke') {
      const { onDone, onError, systemId, in: region } = d.invoke
      let child: Machine<unknown> | undefined
      const invocation: InvokeConfig = {
        id: d.invoke.id ?? d.key,
        src: ({ signal }) => {
          const result = (self as Record<string, (s: AbortSignal) => unknown> | undefined)?.[
            d.key
          ]?.(signal)
          if (!(result instanceof Machine))
            return configured.track && result instanceof Promise ? configured.track(result) : result
          child = result
          return Machine[INTERNAL].adopt(self as Machine<unknown>, child, systemId)
        },
        output: () => (child as { output?: unknown } | undefined)?.output,
        ...(onDone ? { onDone: { target: pathOf(onDone, region) } } : {}),
        ...(onError ? { onError: { target: pathOf(onError, region) } } : {}),
      }
      ;(nodeAt(pathOf(d.state, region)).invoke ??= []).push(invocation)
    }
  }
  return { config, paths, root }
}

// The root enum is the one every other referenced enum descends from.
function rootEnum(ctor: typeof Machine, decorations: Decoration[]): EnumClass<State> {
  if (ctor.states) return ctor.states
  const referenced = new Set<EnumClass<State>>()
  const add = (s: State | HistoryTarget | undefined) => {
    const state = s instanceof HistoryTarget ? s.state : s
    if (state) referenced.add(state.constructor as unknown as EnumClass<State>)
  }
  for (const d of decorations) {
    if (d.kind === 'entry' || d.kind === 'exit') add(d.state)
    else if (d.kind === 'invoke') [d.state, d.invoke.onDone, d.invoke.onError].forEach(add)
    else if ('options' in d) {
      ;[d.options.from ?? []].flat().forEach(add)
      add(d.options.to)
    }
  }
  const below = (e: EnumClass<State>): EnumClass<State>[] =>
    (e.values as State[]).flatMap(s => (s.children ? [s.children, ...below(s.children)] : []))
  const roots = [...referenced].filter(
    e => ![...referenced].some(o => o !== e && below(o).includes(e)),
  )
  if (roots.length === 1) return roots[0]!
  throw new Error(
    `${ctor.name}: ${roots.length ? `states come from unrelated enums (${roots.map(r => (r as unknown as { name: string }).name).join(', ')})` : 'has no states'}; declare static states = YourStates`,
  )
}

/**
 * A statechart, written as a class: `class Fetch extends Machine<FetchState>`. Decorated
 * methods are its events; `@tracked` (or plain) fields are its context. It starts on first use.
 */
export interface Configuration {
  /** Lets a framework track machine reads (state, matches, can, status) and re-render on change. */
  reactivity?: { consume(machine: object): void; dirty(machine: object): void } | undefined
  /** The clock for machines without a `static clock`. */
  clock?: Clock | undefined
  /** Sees every `@invoke` promise; Ember wraps it in a test waiter. Returns the promise to await. */
  track?: (<T>(promise: Promise<T>) => Promise<T>) | undefined
}

const configured: Configuration = {}

/** Process-wide adapter hooks. `@switchyard/ember` calls this on import. */
export function configure(options: Configuration): void {
  Object.assign(configured, options)
}

/** A machine snapshot: the interpreter's, plus the `static persist` fields. JSON-safe if they are. */
export interface MachineSnapshot extends Snapshot {
  context?: Record<string, unknown>
}

/** The Standard Schema interface (https://standardschema.dev), as `Machine.schema()` returns it. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    validate(
      value: unknown,
    ): { readonly value: Output } | { readonly issues: readonly { readonly message: string }[] }
    readonly types?: { readonly input: Input; readonly output: Output }
  }
}

// Restores into a throwaway interpreter with no machine behind it: actions and invokes are
// no-ops there, and its timers are on a clock that never runs.
function checkSnapshot(ctor: typeof Machine, value: unknown): string | undefined {
  const config = (value as Snapshot | null)?.configuration
  if (!Array.isArray(config) || !config.every(p => typeof p === 'string'))
    return 'A snapshot is an object with a configuration: string[]'
  const probe = createInterpreter(compile(ctor, undefined).config, { clock: manualClock() })
  try {
    probe.restore(value as Snapshot)
  } catch (error) {
    return (error as Error).message
  } finally {
    probe.stop()
  }
  return undefined
}

/**
 * Keeps a machine's state in a string property, as active state paths separated by spaces
 * (`'loading.retrying'`). `mirror` (the default) restores from `target[key]` once, then writes
 * every transition back: a record attribute. `accessor` makes `target[key]` a getter/setter over
 * the machine: a query param. Writing restores the machine without running actions, and
 * resets its history. Returns a function that unbinds.
 */
export function bindField(
  machine: Machine<unknown>,
  target: object,
  key: string,
  { mode = 'mirror' }: { mode?: 'mirror' | 'accessor' } = {},
): () => void {
  const t = target as Record<string, unknown>
  const read = () => machine.snapshot().configuration.join(' ')
  const write = (value: unknown) => {
    if (typeof value === 'string' && value) machine.restore({ configuration: value.split(' ') })
  }
  if (mode === 'accessor') {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: true,
      get: read,
      set: write,
    })
    return () => void delete t[key]
  }
  write(t[key])
  return machine.subscribe(() => {
    const value = read()
    if (t[key] !== value) t[key] = value
  })
}

const INTERNAL = Symbol('switchyard.internal')

export abstract class Machine<S = State> {
  /** Throw on an event the current state does not handle, instead of warning. */
  static strict = false
  /** The root state enum, when it cannot be inferred from the decorators. */
  static states?: EnumClass<State>
  /** Timers for `@after`. Tests assign `manualClock()`; it is inherited by subclasses. */
  static clock?: Clock
  /** Context fields `snapshot()` captures and `restore()` sets back. */
  static persist?: string[]

  #interpreter?: Interpreter
  #compiled?: Compiled
  #parent?: Machine<unknown>
  #system = new Map<string, Machine<unknown>>()
  #spawned = new Map<string, Machine<unknown>>()
  #listeners = new Map<string, Set<(event: { type: string }) => void>>()

  // Module-internal: lets compile() link an invoked child, which needs the private fields.
  static [INTERNAL] = {
    adopt(parent: Machine<unknown>, child: Machine<unknown>, systemId: string | undefined) {
      child.#parent = parent
      child.#system = parent.#system
      if (systemId) parent.#system.set(systemId, child)
      return child.#create()
    },
  }

  static toConfig(): MachineConfig {
    return compile(this, undefined).config
  }

  /** A Standard Schema that accepts snapshots this class can restore. */
  static schema(): StandardSchemaV1<unknown, MachineSnapshot> {
    return {
      '~standard': {
        version: 1,
        vendor: 'switchyard',
        validate: value => {
          const message = checkSnapshot(this, value)
          return message ? { issues: [{ message }] } : { value: value as MachineSnapshot }
        },
      },
    }
  }

  snapshot(): MachineSnapshot {
    const i = this.#i
    configured.reactivity?.consume(this)
    const { persist } = this.constructor as typeof Machine
    const snapshot: MachineSnapshot = i.snapshot()
    if (persist)
      snapshot.context = Object.fromEntries(
        persist.map(k => [k, (this as unknown as Record<string, unknown>)[k]]),
      )
    return snapshot
  }

  /** Puts the machine in `snapshot`'s state without running actions. Throws if it does not fit. */
  restore(snapshot: MachineSnapshot): this {
    const ctor = this.constructor as typeof Machine
    const message = checkSnapshot(ctor, snapshot)
    if (message) throw new Error(`${ctor.name}: ${message}`)
    for (const k of ctor.persist ?? [])
      if (snapshot.context && k in snapshot.context)
        (this as unknown as Record<string, unknown>)[k] = snapshot.context[k]
    this.#create().restore(snapshot)
    return this
  }

  get #i(): Interpreter {
    const i = this.#create()
    if (i.status === 'idle') i.start()
    return i
  }

  #create(): Interpreter {
    if (!this.#interpreter) {
      const ctor = this.constructor as typeof Machine
      this.#compiled = compile(ctor, this)
      this.#interpreter = createInterpreter(this.#compiled.config, {
        ...((ctor.clock ?? configured.clock) ? { clock: (ctor.clock ?? configured.clock)! } : {}),
        onUnhandled: event => {
          const message = `${ctor.name}: no transition for "${event.type}" in ${this.#describeState()}`
          if (ctor.strict) throw new Error(message)
          if (dev) console.warn(message)
        },
      })
      this.#interpreter.subscribe(() => configured.reactivity?.dirty(this))
    }
    return this.#interpreter
  }

  #describeState() {
    return this.#i.configuration.join(', ') || '(no state)'
  }

  /** The current state: the root enum's value, or `{ region: value }` for parallel regions. */
  get state(): S {
    // Start first: starting dirties, and dirtying after the read would be a render error.
    const i = this.#i
    configured.reactivity?.consume(this)
    const { root, paths } = this.#compiled!
    const active = (states: EnumClass<State>, region?: string) =>
      (states.values as State[]).find(s =>
        paths.get(s)!.some(p => (!region || p.startsWith(`${region}.`)) && i.matches(p)),
      )
    if (!Array.isArray(root)) return active(root) as S
    return Object.fromEntries(root.map(([k, states]) => [k, active(states, k)])) as S
  }

  get status() {
    configured.reactivity?.consume(this)
    return this.#interpreter?.status ?? 'idle'
  }

  matches(state: State): boolean {
    const i = this.#i
    configured.reactivity?.consume(this)
    return (this.#compiled!.paths.get(state) ?? []).some(p => i.matches(p))
  }

  /** `m.can.fetch`: whether calling `fetch()` now would take a transition. */
  get can(): Record<string, boolean> {
    const i = this.#i
    configured.reactivity?.consume(this)
    return new Proxy(
      {},
      { get: (_t, type) => typeof type === 'string' && i.can({ type, args: [] }) },
    )
  }

  send(event: string, ...args: unknown[]): void {
    this.#i.send({ type: event, args })
  }

  start(): this {
    void this.#i
    return this
  }

  stop(): this {
    for (const child of this.#spawned.values()) child.stop()
    this.#spawned.clear()
    this.#interpreter?.stop()
    return this
  }

  /** Starts `child` as an actor of this machine, stopped when this one stops. */
  spawn<M extends Machine<unknown>>(child: M, options: { id: string; systemId?: string }): M {
    Machine[INTERNAL].adopt(this, child, options.systemId)
    this.#spawned.set(options.id, child)
    return child.start()
  }

  /** Sends an event to a spawned or invoked actor by id. */
  sendTo(id: string, event: string, ...args: unknown[]): void {
    const spawned = this.#spawned.get(id)
    if (spawned) return spawned.send(event, ...args)
    if (!this.#i.sendTo(id, { type: event, args }) && dev)
      console.warn(`${this.constructor.name}: no actor "${id}" for "${event}"`)
  }

  /** Sends an event to the machine that spawned or invoked this one. */
  sendParent(event: string, ...args: unknown[]): void {
    if (this.#parent) this.#parent.send(event, ...args)
    else if (dev) console.warn(`${this.constructor.name}: sendParent("${event}") with no parent`)
  }

  /** Actors registered by systemId anywhere in this machine's tree. */
  get system(): { get(systemId: string): Machine<unknown> | undefined } {
    return this.#system
  }

  /** Delivers `{ type, ...payload }` to `on(type)` listeners outside the machine. */
  emit(type: string, payload: Record<string, unknown> = {}): void {
    for (const listener of [...(this.#listeners.get(type) ?? [])]) listener({ type, ...payload })
  }

  on(
    type: string,
    listener: (event: { type: string; [key: string]: unknown }) => void,
  ): () => void {
    const set = this.#listeners.get(type) ?? new Set()
    this.#listeners.set(type, set.add(listener as (event: { type: string }) => void))
    return () => void set.delete(listener as (event: { type: string }) => void)
  }

  /** Streams the interpreter's events, microsteps and snapshots. Does not start the machine. */
  inspect(listener: (event: InspectionEvent) => void): () => void {
    return this.#create().inspect(listener)
  }

  /** Called after every event that took a transition, and once on start. */
  subscribe(listener: (machine: this) => void): () => void {
    const off = this.#create().subscribe(() => listener(this))
    void this.#i
    return off
  }
}
