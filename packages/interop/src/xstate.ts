// xstate v5 machine JSON in both directions, and xstate config → decorated-class source.
import type {
  Action,
  Guard,
  InvokeConfig,
  MachineConfig,
  StateConfig,
  TransitionConfig,
} from '@switchyard/core'

/** The JSON subset of an xstate v5 machine config: names stand in for guards, actions and actors. */
export interface XStateNode {
  id?: string
  type?: 'atomic' | 'compound' | 'parallel' | 'final' | 'history'
  initial?: string
  history?: 'shallow' | 'deep'
  target?: string
  states?: Record<string, XStateNode>
  on?: Record<string, XStateTransitions>
  always?: XStateTransitions
  after?: Record<string, XStateTransitions>
  entry?: XStateAction | XStateAction[]
  exit?: XStateAction | XStateAction[]
  invoke?: XStateInvoke | XStateInvoke[]
}
export type XStateAction = string | { type: string }
export interface XStateTransition {
  target?: string | string[]
  guard?: string | { type: string }
  actions?: XStateAction | XStateAction[]
  reenter?: boolean
}
export type XStateTransitions = string | XStateTransition | (string | XStateTransition)[]
export interface XStateInvoke {
  id?: string
  src: string
  onDone?: XStateTransitions
  onError?: XStateTransitions
}

type MachineClass = (abstract new (...args: never[]) => unknown) & { toConfig(): MachineConfig }

const names = (fns: { name: string }[] | undefined) => (fns ?? []).map(f => f.name).filter(Boolean)
const list = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])

/**
 * A Switchyard machine as xstate v5 JSON, for Stately Studio and xstate's visualisers. Targets
 * are absolute (`#Fetch.loading.first`); guards, actions and actors are their names.
 */
export function toXState(input: MachineClass | MachineConfig, machineId?: string): XStateNode {
  const isClass = typeof input === 'function'
  const id = machineId ?? (isClass ? input.name : 'machine')
  const ref = (path: string) => `#${id}.${path}`

  const transition = (t: TransitionConfig): XStateTransition => {
    const targets = list(t.target).map(ref)
    const actions = names(t.actions)
    return {
      ...(targets.length ? { target: targets.length === 1 ? targets[0]! : targets } : {}),
      ...(t.guard?.name ? { guard: t.guard.name } : {}),
      ...(actions.length ? { actions } : {}),
      ...(t.reenter ? { reenter: true } : {}),
    }
  }
  const transitions = (ts: TransitionConfig | TransitionConfig[]) => list(ts).map(transition)

  const node = (cfg: StateConfig, path: string): XStateNode => {
    const out: XStateNode = {}
    if (cfg.type) out.type = cfg.type
    if (cfg.type === 'history') {
      out.history = cfg.history ?? 'shallow'
      if (cfg.target) out.target = ref(cfg.target)
      return out
    }
    const keys = Object.keys(cfg.states ?? {})
    if (keys.length && cfg.type !== 'parallel')
      out.initial = cfg.initial ?? keys.find(k => cfg.states![k]!.type !== 'history')!
    if (names(cfg.entry).length) out.entry = names(cfg.entry)
    if (names(cfg.exit).length) out.exit = names(cfg.exit)
    if (cfg.on)
      out.on = Object.fromEntries(Object.entries(cfg.on).map(([e, ts]) => [e, transitions(ts)]))
    if (cfg.always) out.always = transitions(cfg.always)
    if (cfg.after)
      out.after = Object.fromEntries(
        Object.entries(cfg.after).map(([ms, ts]) => [ms, transitions(ts)]),
      )
    if (cfg.invoke)
      out.invoke = cfg.invoke.map((inv, i) => {
        const invId = inv.id ?? `${path || '(root)'}:invocation[${i}]`
        return {
          id: invId,
          src: invId,
          ...(inv.onDone ? { onDone: transition(inv.onDone) } : {}),
          ...(inv.onError ? { onError: transition(inv.onError) } : {}),
        }
      })
    if (keys.length)
      out.states = Object.fromEntries(
        keys.map(k => [k, node(cfg.states![k]!, path ? `${path}.${k}` : k)]),
      )
    return out
  }

  const cfg = isClass ? input.toConfig() : input
  return { id, ...node(cfg, '') }
}

export interface Implementations {
  guards?: Record<string, Guard>
  actions?: Record<string, Action>
  /** Invoke sources by `src` name. */
  actors?: Record<string, InvokeConfig['src']>
}

/** Walks an xstate config, giving every node its dotted path and resolving xstate targets. */
function index(json: XStateNode) {
  const machineId = json.id ?? 'machine'
  const byId = new Map<string, string>()
  const parentOf = new Map<string, string>()
  const paths = new Set<string>()
  const visit = (n: XStateNode, path: string) => {
    paths.add(path)
    byId.set(n.id && path ? n.id : path ? `${machineId}.${path}` : machineId, path)
    for (const [k, c] of Object.entries(n.states ?? {})) {
      const child = path ? `${path}.${k}` : k
      parentOf.set(child, path)
      visit(c, child)
    }
  }
  visit(json, '')
  const join = (a: string, b: string) => (a ? `${a}.${b}` : b)
  /** `#id`, `.child` (of the source) or `sibling` (of the source's parent). */
  const resolve = (source: string, target: string): string => {
    let path: string | undefined
    if (target.startsWith('#')) {
      const [id, ...rest] = target.slice(1).split('.')
      // `#Fetch.loading.first` is the machine id plus a path; `#custom.child` is a node id plus one.
      path =
        byId.get(target.slice(1)) ??
        (byId.has(id!) ? join(byId.get(id!)!, rest.join('.')) : undefined)
    } else if (target.startsWith('.')) path = join(source, target.slice(1))
    else path = join(parentOf.get(source) ?? '', target)
    if (path === undefined || !paths.has(path))
      throw new Error(`xstate target "${target}" from "${source || '(root)'}" names no state`)
    return path
  }
  return { machineId, resolve }
}

/**
 * An xstate config as a Switchyard interpreter config. Guards, actions and actors are looked up
 * by name in `implementations`; a missing guard or actor throws, a missing action is a no-op.
 */
export function fromXState(json: XStateNode, implementations: Implementations = {}): MachineConfig {
  const { resolve } = index(json)
  const named = <F extends (...args: never[]) => unknown>(fn: F, name: string): F =>
    Object.defineProperty(fn, 'name', { value: name })
  const actionName = (a: XStateAction) => (typeof a === 'string' ? a : a.type)
  const action = (a: XStateAction): Action => {
    const n = actionName(a)
    return implementations.actions?.[n] ?? named(() => {}, n)
  }
  const guard = (g: string | { type: string }): Guard => {
    const n = typeof g === 'string' ? g : g.type
    const fn = implementations.guards?.[n]
    if (!fn) throw new Error(`xstate guard "${n}" has no implementation`)
    return named((e => fn(e)) as Guard, n)
  }
  const transition = (source: string, t: string | XStateTransition): TransitionConfig => {
    const obj: XStateTransition = typeof t === 'string' ? { target: t } : t
    const targets = list(obj.target).map(x => resolve(source, x))
    return {
      ...(targets.length ? { target: targets.length === 1 ? targets[0]! : targets } : {}),
      ...(obj.guard ? { guard: guard(obj.guard) } : {}),
      ...(obj.actions ? { actions: list(obj.actions).map(action) } : {}),
      // xstate v5 and Switchyard share the default: no re-entry for a descendant target.
      ...(obj.reenter ? { reenter: true } : {}),
    }
  }
  const transitions = (source: string, ts: XStateTransitions) =>
    list<string | XStateTransition>(ts).map(t => transition(source, t))

  const node = (n: XStateNode, path: string): StateConfig => {
    const out: StateConfig = {}
    if (n.type && n.type !== 'atomic' && n.type !== 'compound') out.type = n.type
    if (n.type === 'history') {
      out.history = n.history ?? 'shallow'
      if (n.target) out.target = resolve(path, n.target)
      return out
    }
    if (n.initial) out.initial = n.initial
    if (n.entry) out.entry = list(n.entry).map(action)
    if (n.exit) out.exit = list(n.exit).map(action)
    if (n.on)
      out.on = Object.fromEntries(Object.entries(n.on).map(([e, ts]) => [e, transitions(path, ts)]))
    if (n.always) out.always = transitions(path, n.always)
    if (n.after)
      out.after = Object.fromEntries(
        Object.entries(n.after).map(([ms, ts]) => [Number(ms), transitions(path, ts)]),
      )
    if (n.invoke)
      out.invoke = list(n.invoke).map(inv => {
        const src = implementations.actors?.[inv.src]
        if (!src) throw new Error(`xstate actor "${inv.src}" has no implementation`)
        return {
          ...(inv.id ? { id: inv.id } : {}),
          src,
          ...(inv.onDone ? { onDone: transitions(path, inv.onDone)[0]! } : {}),
          ...(inv.onError ? { onError: transitions(path, inv.onError)[0]! } : {}),
        }
      })
    if (n.states)
      out.states = Object.fromEntries(
        Object.entries(n.states).map(([k, c]) => [k, node(c, path ? `${path}.${k}` : k)]),
      )
    return out
  }
  return node(json, '')
}

const pascal = (s: string) => {
  const p = s.replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_m, _sep, c: string) => c.toUpperCase())
  return /^[0-9]/.test(p) ? `_${p}` : p || '_'
}
const isIdentifier = (s: string) => /^[A-Za-z_$][\w$]*$/.test(s)

/**
 * TypeScript source for a decorated Switchyard class equivalent to an xstate config. Guards
 * become getter stubs and invoked actors async method stubs, each marked TODO; transition
 * actions are listed in the event method's body. What the DSL cannot express yet (nested
 * parallel states, non-identifier event names, multiple targets, compound onDone) is left as a
 * comment rather than guessed.
 */
export function toClassSource(json: XStateNode, name = pascal(json.id ?? 'Machine')): string {
  const { resolve } = index(json)
  const enums: string[] = []
  const enumOf = new Map<string, string>() // compound path → enum class name
  const exprOf = new Map<string, string>() // state path → `Enum.Member`
  const historyOf = new Map<string, string>() // history node path → its parent's path
  const unsupported: string[] = []
  const regions: [string, string][] = []

  const declareEnum = (n: XStateNode, path: string, className: string) => {
    const keys = Object.keys(n.states ?? {}).filter(k => n.states![k]!.type !== 'history')
    if (n.initial && keys.includes(n.initial))
      keys.splice(0, 0, ...keys.splice(keys.indexOf(n.initial), 1))
    enumOf.set(path, className)
    const members: string[] = []
    for (const k of keys) {
      const c = n.states![k]!
      const childPath = path ? `${path}.${k}` : k
      exprOf.set(childPath, `${className}.${pascal(k)}`)
      const opts: string[] = []
      if (c.type === 'parallel')
        unsupported.push(`state "${childPath}" is parallel; only the root can be`)
      else if (c.states) {
        const child = `${name}${pascal(childPath)}`
        declareEnum(c, childPath, child)
        opts.push(`children: ${child}`)
        const h = Object.entries(c.states).find(([, s]) => s.type === 'history')
        if (h) {
          opts.push(`history: '${h[1].history ?? 'shallow'}'`)
          historyOf.set(`${childPath}.${h[0]}`, childPath)
        }
      }
      if (c.type === 'final') opts.push('final: true')
      members.push(
        `  static ${pascal(k)} = ${className}.of('${k}'${opts.length ? `, { ${opts.join(', ')} }` : ''})`,
      )
    }
    enums.push(`export class ${className} extends State {\n${members.join('\n')}\n}`)
  }

  if (json.type === 'parallel') {
    for (const [k, r] of Object.entries(json.states ?? {})) {
      const cls = `${name}${pascal(k)}`
      declareEnum(r, k, cls)
      regions.push([k, cls])
    }
  } else declareEnum(json, '', `${name}State`)

  const ref = (path: string) => {
    if (historyOf.has(path)) return `history(${exprOf.get(historyOf.get(path)!)})`
    const e = exprOf.get(path)
    if (!e) throw new Error(`No state expression for "${path}"`)
    return e
  }
  const regionOf = (path: string) => (regions.length ? path.split('.')[0] : undefined)

  const guards = new Set<string>()
  const events = new Map<string, string[]>() // method name → decorators
  const bodies = new Map<string, Set<string>>()
  const members: string[] = []
  const imports = new Set(['Machine', 'State'])

  const options = (source: string | undefined, t: XStateTransition, where: string) => {
    const targets = list(t.target).map(x => resolve(source ?? '', x))
    if (targets.length > 1) {
      unsupported.push(`${where} has several targets`)
      return undefined
    }
    const parts: string[] = []
    const region = regionOf(targets[0] ?? source ?? '')
    if (region) parts.push(`in: '${region}'`)
    if (source !== undefined) parts.push(`from: ${ref(source)}`)
    if (targets[0] !== undefined) {
      if (historyOf.has(targets[0])) imports.add('history')
      parts.push(`to: ${ref(targets[0])}`)
    }
    if (t.guard) {
      const g = typeof t.guard === 'string' ? t.guard : t.guard.type
      guards.add(g)
      parts.push(`guard: '${g}'`)
    }
    if (t.reenter) parts.push('reenter: true')
    return `{ ${parts.join(', ')} }`
  }

  const walk = (n: XStateNode, path: string) => {
    const source = path || undefined
    for (const [event, ts] of Object.entries(n.on ?? {})) {
      for (const t of list<string | XStateTransition>(ts)) {
        const obj = typeof t === 'string' ? { target: t } : t
        if (!isIdentifier(event)) {
          unsupported.push(`event "${event}" on "${path || '(root)'}" is not a method name`)
          continue
        }
        const opts = options(source, obj, `"${event}" on "${path || '(root)'}"`)
        if (!opts) continue
        imports.add('transition')
        events.set(event, [...(events.get(event) ?? []), `  @transition(${opts})`])
        for (const a of list(obj.actions))
          (bodies.get(event) ?? bodies.set(event, new Set()).get(event)!).add(
            typeof a === 'string' ? a : a.type,
          )
      }
    }
    list<string | XStateTransition>(n.always).forEach((t, i) => {
      const obj = typeof t === 'string' ? { target: t } : t
      const opts = options(source, obj, `always on "${path || '(root)'}"`)
      if (!opts) return
      imports.add('always')
      members.push(`  @always(${opts})\n  always${pascal(path || 'root')}${i || ''}() {}`)
    })
    for (const [ms, ts] of Object.entries(n.after ?? {})) {
      for (const t of list<string | XStateTransition>(ts)) {
        const obj = typeof t === 'string' ? { target: t } : t
        const opts = options(source, obj, `after ${ms} on "${path || '(root)'}"`)
        if (!opts) continue
        imports.add('after')
        members.push(`  @after(${ms}, ${opts})\n  after${ms}${pascal(path || 'root')}() {}`)
      }
    }
    if (source) {
      for (const [kind, deco] of [
        ['entry', 'onEntry'],
        ['exit', 'onExit'],
      ] as const) {
        for (const a of list(n[kind])) {
          imports.add(deco)
          const region = regionOf(path)
          members.push(
            `  @${deco}(${ref(path)}${region ? `, { in: '${region}' }` : ''})\n  ${typeof a === 'string' ? a : a.type}() {}`,
          )
        }
      }
      for (const inv of list(n.invoke)) {
        imports.add('invoke')
        const opts: string[] = []
        if (inv.id && inv.id !== inv.src) opts.push(`id: '${inv.id}'`)
        for (const [k, ts] of [
          ['onDone', inv.onDone],
          ['onError', inv.onError],
        ] as const) {
          const t = ts && list<string | XStateTransition>(ts)[0]
          if (!t) continue
          const target = list(typeof t === 'string' ? t : t.target)[0]
          if (target) opts.push(`${k}: ${ref(resolve(path, target))}`)
        }
        members.push(
          `  @invoke(${ref(path)}${opts.length ? `, { ${opts.join(', ')} }` : ''})\n  async ${inv.src}(_signal: AbortSignal) {\n    // TODO: the "${inv.src}" actor\n  }`,
        )
      }
    } else if (n.entry || n.exit || n.invoke) unsupported.push('root entry, exit and invoke')
    if ((n as { onDone?: unknown }).onDone) unsupported.push(`onDone of "${path || '(root)'}"`)
    for (const [k, c] of Object.entries(n.states ?? {}))
      if (c.type !== 'history') walk(c, path ? `${path}.${k}` : k)
  }
  walk(json, '')

  const methods = [...events].map(([event, decorators]) => {
    const acts = [...(bodies.get(event) ?? [])]
    const body = acts.length ? `\n    // xstate actions: ${acts.join(', ')}\n  ` : ''
    return `${decorators.join('\n')}\n  ${event}() {${body}}`
  })
  const getters = [...guards].map(g =>
    isIdentifier(g)
      ? `  get ${g}(): boolean {\n    return false // TODO: the "${g}" guard\n  }`
      : `  // TODO: guard "${g}" is not a getter name`,
  )
  if (regions.length) imports.add('region')
  const fields = regions.map(([k, cls]) => `  @region(${cls}) accessor ${k}!: ${cls}`)
  const stateType = regions.length
    ? `{ ${regions.map(([k, cls]) => `${k}: ${cls}`).join('; ')} }`
    : `${name}State`

  const body = [...fields, ...getters, ...methods, ...members].join('\n\n')
  return [
    '// Generated by @switchyard/interop from an xstate config.',
    `import { ${[...imports].sort().join(', ')} } from '@switchyard/core'`,
    '',
    enums.join('\n\n'),
    '',
    ...(unsupported.length ? [`// Not converted: ${unsupported.join('; ')}.`, ''] : []),
    `export class ${name} extends Machine<${stateType}> {`,
    body,
    '}',
    '',
  ].join('\n')
}
