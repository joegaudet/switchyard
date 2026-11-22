// The decorator DSL. A Machine subclass is compiled, per instance, into the interpreter's
// plain-data config: its State enums become the state tree, its decorated methods the
// transitions and actions. Decorators work in both modes Ember apps meet: TC39 standard
// (recorded on `context.metadata`) and legacy/experimentalDecorators (recorded per prototype).
import type { EnumClass } from '@real-enums/core'
import type { State } from './state.js'
import {
  createInterpreter,
  type Action,
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

type Decoration =
  | { kind: 'transition'; key: string; options: TransitionOptions; body: Fn }
  | { kind: 'always'; key: string; options: TransitionOptions }
  | { kind: 'entry' | 'exit'; key: string; state: State; in: string | undefined }
  | { kind: 'region'; key: string; states: EnumClass<State> }

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
export abstract class Machine<S = State> {
  /** Throw on an event the current state does not handle, instead of warning. */
  static strict = false
  /** The root state enum, when it cannot be inferred from the decorators. */
  static states?: EnumClass<State>

  #interpreter?: Interpreter
  #compiled?: Compiled

  static toConfig(): MachineConfig {
    return compile(this, undefined).config
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
        onUnhandled: event => {
          const message = `${ctor.name}: no transition for "${event.type}" in ${this.#describeState()}`
          if (ctor.strict) throw new Error(message)
          if (dev) console.warn(message)
        },
      })
    }
    return this.#interpreter
  }

  #describeState() {
    return this.#i.configuration.join(', ') || '(no state)'
  }

  /** The current state: the root enum's value, or `{ region: value }` for parallel regions. */
  get state(): S {
    const i = this.#i
    const { root, paths } = this.#compiled!
    const active = (states: EnumClass<State>, region?: string) =>
      (states.values as State[]).find(s =>
        paths.get(s)!.some(p => (!region || p.startsWith(`${region}.`)) && i.matches(p)),
      )
    if (!Array.isArray(root)) return active(root) as S
    return Object.fromEntries(root.map(([k, states]) => [k, active(states, k)])) as S
  }

  get status() {
    return this.#interpreter?.status ?? 'idle'
  }

  matches(state: State): boolean {
    const i = this.#i
    return (this.#compiled!.paths.get(state) ?? []).some(p => i.matches(p))
  }

  /** `m.can.fetch`: whether calling `fetch()` now would take a transition. */
  get can(): Record<string, boolean> {
    const i = this.#i
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
    this.#interpreter?.stop()
    return this
  }

  /** Called after every event that took a transition, and once on start. */
  subscribe(listener: (machine: this) => void): () => void {
    const off = this.#create().subscribe(() => listener(this))
    void this.#i
    return off
  }
}
