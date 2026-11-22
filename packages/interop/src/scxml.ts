// W3C SCXML (https://www.w3.org/TR/scxml/), structure and the executable content that needs no
// datamodel: <raise>, <send> without a delay, and <log> (which names an action). Anything that
// needs a datamodel is refused rather than dropped.
import { isFunction } from '@sindresorhus/is'
import { XMLParser } from 'fast-xml-parser'
import type {
  Action,
  Guard,
  MachineConfig,
  StateConfig,
  TransitionConfig,
} from '@switchyard-ts/core'

const SCXML_NS = 'http://www.w3.org/2005/07/scxml'
const SY_NS = 'https://joegaudet.com/switchyard'

type MachineClass = (abstract new (...args: never[]) => unknown) & { toConfig(): MachineConfig }

export interface ScxmlImplementations {
  /** By `cond` text. */
  guards?: Record<string, Guard>
  /** By `<log label>` (or `expr`). A missing one is a no-op named after the label. */
  actions?: Record<string, Action>
}

type XmlNode = Record<string, unknown>
const tagOf = (n: XmlNode) => Object.keys(n).find(k => k !== ':@' && !k.startsWith('?'))
const attrsOf = (n: XmlNode) => (n[':@'] ?? {}) as Record<string, string>
const childrenOf = (n: XmlNode) =>
  ((n[tagOf(n)!] ?? []) as XmlNode[]).filter(c => {
    const t = tagOf(c)
    return t && !t.startsWith('#')
  })

const STATES = new Set(['state', 'parallel', 'final', 'history'])
const named = <F extends (...args: never[]) => unknown>(fn: F, name: string): F =>
  Object.defineProperty(fn, 'name', { value: name })

/**
 * An SCXML document as an interpreter config. Event descriptors keep SCXML's prefix matching
 * (`foo` also matches `foo.bar`), unless the document was written by `toScxml`, which marks
 * them exact.
 */
export function fromScxml(xml: string, implementations: ScxmlImplementations = {}): MachineConfig {
  const parsed = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
    trimValues: true,
  }).parse(xml) as XmlNode[]
  const root = parsed.find(n => tagOf(n) === 'scxml')
  if (!root) throw new Error('Not an SCXML document: no <scxml> element')
  const exact = Object.entries(attrsOf(root)).some(
    ([k, v]) =>
      k.endsWith(':descriptors') &&
      v === 'exact' &&
      attrsOf(root)[`xmlns:${k.split(':')[0]}`] === SY_NS,
  )

  // Pass 1: every state's path, so targets can point forward.
  const pathOf = new Map<string, string>()
  let anonymous = 0
  const ids = new WeakMap<XmlNode, string>()
  const assign = (n: XmlNode, parentId: string, parentPath: string) => {
    for (const c of childrenOf(n)) {
      if (!STATES.has(tagOf(c)!)) continue
      const id = attrsOf(c)['id'] ?? `_anonymous${++anonymous}`
      const key = parentId && id.startsWith(`${parentId}.`) ? id.slice(parentId.length + 1) : id
      if (key.includes('.'))
        throw new Error(`State id "${id}" contains "." outside its parent's id prefix`)
      const path = parentPath ? `${parentPath}.${key}` : key
      ids.set(c, id)
      pathOf.set(id, path)
      assign(c, id, path)
    }
  }
  assign(root, '', '')

  const target = (ids_: string | undefined) =>
    (ids_ ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map(id => {
        const p = pathOf.get(id)
        if (p === undefined) throw new Error(`Transition target "${id}" names no state`)
        return p
      })

  const descriptor = (event: string) =>
    event
      .split(/\s+/)
      .filter(Boolean)
      .map(t =>
        exact || t === '*' || t.endsWith('.*')
          ? t
          : `${t.replace(/\.$/, '')} ${t.replace(/\.$/, '')}.*`,
      )
      .join(' ')

  const executable = (n: XmlNode): Action[] =>
    childrenOf(n).map(c => {
      const tag = tagOf(c)!
      const a = attrsOf(c)
      if (tag === 'raise')
        return named((_e, api) => api.raise({ type: a['event']! }), `raise ${a['event']}`)
      if (tag === 'send' && a['event'] && !a['delay'] && !a['delayexpr'] && !a['target'])
        return named((_e, api) => api.send({ type: a['event']! }), `send ${a['event']}`)
      if (tag === 'log') {
        const name = a['label'] ?? a['expr'] ?? 'log'
        return implementations.actions?.[name] ?? named(() => {}, name)
      }
      throw new Error(`<${tag}> is not supported (it needs a datamodel or a delayed send)`)
    })

  const transition = (t: XmlNode): [string | undefined, TransitionConfig] => {
    const a = attrsOf(t)
    const targets = target(a['target'])
    const cond = a['cond']
    let guard: Guard | undefined
    if (cond) {
      const fn = implementations.guards?.[cond]
      if (!fn) throw new Error(`cond "${cond}" has no implementation`)
      guard = named((e => fn(e)) as Guard, cond)
    }
    const actions = executable(t)
    return [
      a['event'] ? descriptor(a['event']) : undefined,
      {
        ...(targets.length ? { target: targets.length === 1 ? targets[0]! : targets } : {}),
        ...(guard ? { guard } : {}),
        ...(actions.length ? { actions } : {}),
        // SCXML's default type is external: a descendant target re-enters the source.
        ...(targets.length && a['type'] !== 'internal' ? { reenter: true } : {}),
      },
    ]
  }

  const firstChildKey = (n: XmlNode, ids_: string | undefined, where: string) => {
    if (!ids_) return undefined
    const parts = ids_.split(/\s+/)
    const kids = childrenOf(n).filter(c => STATES.has(tagOf(c)!))
    const child = kids.find(c => ids.get(c) === parts[0])
    if (parts.length > 1 || !child)
      throw new Error(`${where}: an initial state must be one direct child (got "${ids_}")`)
    return pathOf.get(ids.get(child)!)!.split('.').pop()!
  }

  const build = (n: XmlNode): StateConfig => {
    const tag = tagOf(n)!
    const out: StateConfig = {}
    if (tag === 'parallel') out.type = 'parallel'
    if (tag === 'final') out.type = 'final'
    if (tag === 'history') {
      out.type = 'history'
      out.history = attrsOf(n)['type'] === 'deep' ? 'deep' : 'shallow'
      const t = childrenOf(n).find(c => tagOf(c) === 'transition')
      const targets = t ? target(attrsOf(t)['target']) : []
      if (targets.length > 1)
        throw new Error('A history default with several targets is not supported')
      if (targets[0]) out.target = targets[0]
      return out
    }
    let initial = firstChildKey(n, attrsOf(n)['initial'], `<${tag} id="${ids.get(n) ?? ''}">`)
    const states: Record<string, StateConfig> = {}
    for (const c of childrenOf(n)) {
      const ctag = tagOf(c)!
      if (STATES.has(ctag)) states[pathOf.get(ids.get(c)!)!.split('.').pop()!] = build(c)
      else if (ctag === 'transition') {
        const [event, t] = transition(c)
        if (event === undefined) (out.always ??= []).push(t)
        else {
          const on = (out.on ??= {})
          on[event] = [...[on[event] ?? []].flat(), t]
        }
      } else if (ctag === 'onentry') (out.entry ??= []).push(...executable(c))
      else if (ctag === 'onexit') (out.exit ??= []).push(...executable(c))
      else if (ctag === 'initial') {
        const t = childrenOf(c).find(x => tagOf(x) === 'transition')
        if (t && childrenOf(t).length)
          throw new Error('Executable content in <initial> is not supported')
        initial = firstChildKey(n, t && attrsOf(t)['target'], `<initial> of "${ids.get(n)}"`)
      } else throw new Error(`<${ctag}> is not supported`)
    }
    if (Object.keys(states).length) out.states = states
    if (initial) out.initial = initial
    return out
  }

  return build(root)
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * A machine as an SCXML document. Ids are state paths; actions become `<log label="name"/>`
 * and guards `cond="name"`, so `fromScxml` with the same implementations restores them.
 * Delayed transitions and invokes need a datamodel to express, and are refused.
 */
export function toScxml(input: MachineClass | MachineConfig, name?: string): string {
  const isClass = isFunction(input)
  const config = isClass ? input.toConfig() : input
  const id = (path: string) => path.replace(/\$/g, '_')
  const lines: string[] = []
  const pad = (d: number) => '  '.repeat(d)

  const logs = (actions: Action[] | undefined, depth: number) =>
    (actions ?? []).map(a => `${pad(depth)}<log label="${esc(a.name)}"/>`)

  const transition = (event: string | undefined, t: TransitionConfig, depth: number) => {
    const targets = [t.target ?? []].flat()
    if (t.guard && !t.guard.name) throw new Error('An unnamed guard cannot be written as a cond')
    const attrs = [
      event !== undefined ? `event="${esc(event)}"` : '',
      t.guard ? `cond="${esc(t.guard.name)}"` : '',
      targets.length ? `target="${esc(targets.map(id).join(' '))}"` : '',
      targets.length && !t.reenter ? 'type="internal"' : '',
    ].filter(Boolean)
    const body = logs(t.actions, depth + 1)
    lines.push(
      body.length
        ? `${pad(depth)}<transition ${attrs.join(' ')}>\n${body.join('\n')}\n${pad(depth)}</transition>`
        : `${pad(depth)}<transition ${attrs.join(' ')}/>`,
    )
  }

  const initialOf = (cfg: StateConfig) => {
    const keys = Object.keys(cfg.states ?? {})
    return cfg.initial ?? keys.find(k => cfg.states![k]!.type !== 'history')
  }

  const node = (cfg: StateConfig, path: string, depth: number) => {
    if (cfg.after) throw new Error(`"${path}": after needs a delayed <send> and a datamodel`)
    if (cfg.invoke) throw new Error(`"${path}": invoke is not supported`)
    const parent = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : ''
    if (cfg.type === 'history') {
      const fallback =
        cfg.target ?? (parent ? `${parent}.${initialOf(parentCfg.get(parent)!)}` : '')
      lines.push(`${pad(depth)}<history id="${esc(id(path))}" type="${cfg.history ?? 'shallow'}">`)
      lines.push(`${pad(depth + 1)}<transition target="${esc(id(fallback))}"/>`)
      lines.push(`${pad(depth)}</history>`)
      return
    }
    const tag = cfg.type === 'parallel' ? 'parallel' : cfg.type === 'final' ? 'final' : 'state'
    const initial = tag === 'state' ? initialOf(cfg) : undefined
    const attrs = [
      `id="${esc(id(path))}"`,
      initial ? `initial="${esc(id(`${path}.${initial}`))}"` : '',
    ]
    const open = `${pad(depth)}<${tag} ${attrs.filter(Boolean).join(' ')}`
    const at = lines.push(`${open}>`)
    body(cfg, path, depth + 1)
    if (lines.length === at) lines[at - 1] = `${open}/>`
    else lines.push(`${pad(depth)}</${tag}>`)
  }

  const parentCfg = new Map<string, StateConfig>()
  const body = (cfg: StateConfig, path: string, depth: number) => {
    parentCfg.set(path, cfg)
    if (cfg.entry?.length)
      lines.push(`${pad(depth)}<onentry>`, ...logs(cfg.entry, depth + 1), `${pad(depth)}</onentry>`)
    if (cfg.exit?.length)
      lines.push(`${pad(depth)}<onexit>`, ...logs(cfg.exit, depth + 1), `${pad(depth)}</onexit>`)
    for (const [event, ts] of Object.entries(cfg.on ?? {}))
      for (const t of [ts].flat()) transition(event, t, depth)
    for (const t of cfg.always ?? []) transition(undefined, t, depth)
    for (const [k, c] of Object.entries(cfg.states ?? {})) node(c, path ? `${path}.${k}` : k, depth)
  }

  if (config.type === 'parallel')
    throw new Error('A parallel root has no SCXML form; wrap it in a <parallel> state')
  if (config.entry?.length || config.exit?.length || config.after || config.invoke)
    throw new Error('Root entry, exit, after and invoke have no SCXML form')
  const initial = initialOf(config)
  lines.push(
    `<scxml xmlns="${SCXML_NS}" xmlns:sy="${SY_NS}" sy:descriptors="exact" version="1.0"` +
      `${name || isClass ? ` name="${esc(name ?? (input as MachineClass).name)}"` : ''}` +
      `${initial ? ` initial="${esc(id(initial))}"` : ''}>`,
  )
  parentCfg.set('', config)
  for (const [event, ts] of Object.entries(config.on ?? {}))
    for (const t of [ts].flat()) transition(event, t, 1)
  for (const t of config.always ?? []) transition(undefined, t, 1)
  for (const [k, c] of Object.entries(config.states ?? {})) node(c, k, 1)
  lines.push('</scxml>')
  return `<?xml version="1.0" encoding="UTF-8"?>\n${lines.join('\n')}\n`
}
