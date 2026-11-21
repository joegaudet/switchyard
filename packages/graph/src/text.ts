// Text renderers: Mermaid (renders in GitHub READMEs and PRs) and Graphviz DOT.
import type { ActorNode, Graph, GraphState, MachineInterface } from './graph.js'

const mid = (id: string) => (id ? id.replace(/\W/g, '_') : 'root')
const quote = (s: string) => s.replace(/"/g, "'")

function historyLabel(s: GraphState) {
  return s.history === 'deep' ? 'H*' : 'H'
}

/** A Mermaid `stateDiagram-v2`. */
export function toMermaid(graph: Graph): string {
  const lines = ['stateDiagram-v2']
  const pad = (depth: number) => '  '.repeat(depth)

  const body = (s: GraphState, depth: number) => {
    if (s.initial) lines.push(`${pad(depth)}[*] --> ${mid(s.initial)}`)
    s.children.forEach((c, i) => {
      if (s.type === 'parallel' && i > 0) lines.push(`${pad(depth)}--`)
      declare(c, depth)
    })
  }

  const declare = (s: GraphState, depth: number) => {
    const label = s.type === 'history' ? historyLabel(s) : s.key
    if (s.children.some(c => c.type !== 'history') || s.type === 'parallel') {
      lines.push(`${pad(depth)}state "${quote(label)}" as ${mid(s.id)} {`)
      body(s, depth + 1)
      lines.push(`${pad(depth)}}`)
    } else {
      lines.push(`${pad(depth)}state "${quote(label)}" as ${mid(s.id)}`)
      for (const h of s.children) declare(h, depth)
    }
    if (s.type === 'final') lines.push(`${pad(depth)}${mid(s.id)} --> [*]`)
  }

  // Mermaid only allows `--` region separators inside a composite state, so a parallel root
  // is drawn as one.
  if (graph.root.type === 'parallel') declare({ ...graph.root, key: graph.name }, 1)
  else body(graph.root, 1)

  for (const t of graph.transitions)
    lines.push(`  ${mid(t.source)} --> ${mid(t.target ?? t.source)} : ${quote(t.label)}`)
  return `${lines.join('\n')}\n`
}

/** Graphviz DOT. Compound states are clusters; edges to them meet the cluster's border. */
export function toDot(graph: Graph): string {
  const lines = [
    `digraph "${quote(graph.name)}" {`,
    '  compound=true; rankdir=LR;',
    '  node [shape=box, style=rounded, fontname="Helvetica"];',
    '  edge [fontname="Helvetica", fontsize=10];',
  ]
  const clusters = new Set<string>()

  const declare = (s: GraphState, depth: number) => {
    const pad = '  '.repeat(depth)
    if (s.children.length && s.type !== 'history') {
      clusters.add(s.id)
      lines.push(`${pad}subgraph cluster_${mid(s.id)} {`)
      lines.push(
        `${pad}  label="${quote(s.key)}"; style=${s.type === 'parallel' ? 'dashed' : 'rounded'};`,
      )
      // An invisible anchor: edges point at it and are clipped to the cluster (lhead/ltail).
      lines.push(`${pad}  ${mid(s.id)} [shape=point, style=invis];`)
      if (s.initial) {
        lines.push(`${pad}  ${mid(s.id)}__start [shape=point, width=0.1];`)
        lines.push(`${pad}  ${mid(s.id)}__start -> ${mid(s.initial)};`)
      }
      s.children.forEach(c => declare(c, depth + 1))
      lines.push(`${pad}}`)
      return
    }
    const attrs =
      s.type === 'history'
        ? `shape=circle, label="${historyLabel(s)}"`
        : `label="${quote(s.key)}"${s.type === 'final' ? ', peripheries=2' : ''}`
    lines.push(`${pad}${mid(s.id)} [${attrs}];`)
  }

  if (graph.root.initial) {
    lines.push('  __start [shape=point, width=0.15];')
    lines.push(`  __start -> ${mid(graph.root.initial)};`)
  }
  graph.root.children.forEach(c => declare(c, 1))
  for (const t of graph.transitions) {
    const target = t.target ?? t.source
    const attrs = [`label="${quote(t.label)}"`]
    if (clusters.has(t.source)) attrs.push(`ltail=cluster_${mid(t.source)}`)
    if (clusters.has(target)) attrs.push(`lhead=cluster_${mid(target)}`)
    lines.push(`  ${mid(t.source)} -> ${mid(target)} [${attrs.join(', ')}];`)
  }
  lines.push('}')
  return `${lines.join('\n')}\n`
}

/** The interface view as a Mermaid class diagram. */
export function interfaceToMermaid(iface: MachineInterface): string {
  const lines = ['classDiagram', `  class ${mid(iface.name)} {`, '    <<machine>>']
  for (const e of iface.events) lines.push(`    +${e.name}() ${e.from.join(', ')}`)
  for (const g of iface.guards) lines.push(`    -guard ${g.replace(/\s+/g, '')}`)
  for (const a of iface.actions) lines.push(`    #${a.name}() ${a.on}`)
  for (const i of iface.invokes) lines.push(`    #invoke ${i.id}`)
  lines.push('  }')
  return `${lines.join('\n')}\n`
}

/** The actor tree as a Mermaid flowchart. */
export function topologyToMermaid(root: ActorNode): string {
  const lines = ['flowchart LR']
  const visit = (n: ActorNode, path: string) => {
    lines.push(
      `  ${mid(path)}["${quote(`${n.id}: ${n.machine}`)}<br/>${quote(n.configuration.join(', '))}"]`,
    )
    for (const c of n.children) {
      const childPath = `${path}.${c.id}`
      visit(c, childPath)
      lines.push(`  ${mid(path)} --> ${mid(childPath)}`)
    }
  }
  visit(root, 'actor')
  return `${lines.join('\n')}\n`
}
