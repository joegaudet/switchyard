// A standalone SVG, laid out by ELK (layered, with compound states as nested nodes). Every
// state is a `<g data-state="path">` and every transition a `<g data-source data-target>`, which
// is what the live viewer highlights.
import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js'
import { states, type Graph, type GraphState } from './graph.js'

const CHAR = 7
const LABEL_CHAR = 6
const TITLE = 26

// A transition from the root is handled in every state; ELK cannot draw an edge out of the root
// itself, so those come from an "any state" node.
const nid = (id: string) => (id ? `s:${id}` : 'any')
const start = (id: string) => `start:${id}`
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Options for {@link toSvg}. */
export interface SvgOptions {
  /** Which way transitions flow: left to right (the default) or top to bottom. */
  direction?: 'RIGHT' | 'DOWN'
}

/**
 * The graph as a standalone SVG document, laid out by ELK with compound states as nested boxes.
 * Each state is a `<g data-state="path">` and each transition a `<g data-source data-target>`,
 * which the live viewer highlights.
 */
export async function toSvg(
  graph: Graph,
  { direction = 'RIGHT' }: SvgOptions = {},
): Promise<string> {
  const node = (s: GraphState): ElkNode => {
    if (s.type === 'history') return { id: nid(s.id), width: 24, height: 24 }
    const compound = s.children.length > 0
    if (!compound)
      return { id: nid(s.id), width: Math.max(64, s.key.length * CHAR + 28), height: 34 }
    const children = s.children.map(node)
    if (s.initial) children.unshift({ id: start(s.id), width: 10, height: 10 })
    return {
      id: nid(s.id),
      children,
      layoutOptions: {
        'elk.padding': `[top=${TITLE + 8},left=14,bottom=14,right=14]`,
        'elk.nodeSize.minimum': `(${s.key.length * CHAR + 28}, 40)`,
        'elk.nodeSize.constraints': 'MINIMUM_SIZE',
      },
    }
  }

  const edges: ElkExtendedEdge[] = graph.transitions.map((t, i) => ({
    id: `t${i}`,
    sources: [nid(t.source)],
    targets: [nid(t.target ?? t.source)],
    labels: [{ text: t.label, width: t.label.length * LABEL_CHAR + 8, height: 14 }],
  }))
  for (const s of states(graph))
    if (s.initial)
      edges.push({ id: `i:${s.id}`, sources: [start(s.id)], targets: [nid(s.initial)], labels: [] })

  const rootChildren = graph.root.children.map(node)
  if (graph.root.initial) rootChildren.unshift({ id: start(''), width: 10, height: 10 })
  const anyState = graph.transitions.some(t => !t.source)
  if (anyState) rootChildren.push({ id: 'any', width: 72, height: 22 })
  const input: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
      'elk.spacing.nodeNode': '24',
      'elk.spacing.edgeLabel': '4',
      'elk.edgeLabels.inline': 'false',
      'elk.json.shapeCoords': 'ROOT',
      'elk.json.edgeCoords': 'ROOT',
      'elk.padding': '[top=12,left=12,bottom=12,right=12]',
    },
    children: rootChildren,
    edges,
  }
  const laid = await new ELK().layout(input)

  const boxes = new Map<string, ElkNode>()
  const collect = (n: ElkNode) => {
    boxes.set(n.id, n)
    n.children?.forEach(collect)
  }
  collect(laid)

  // Regions of a parallel state are dashed, as statechart notation draws them.
  const regions = new Set(
    states(graph)
      .filter(s => s.type === 'parallel')
      .flatMap(s => s.children.map(c => c.id)),
  )
  const out: string[] = []
  for (const s of states(graph).slice(1)) {
    const b = boxes.get(nid(s.id))!
    const [x, y, w, h] = [b.x ?? 0, b.y ?? 0, b.width ?? 0, b.height ?? 0]
    const g = `<g class="sy-state sy-${s.type}" data-state="${esc(s.id)}">`
    if (s.type === 'history') {
      out.push(
        `${g}<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}"/>` +
          `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle">${s.history === 'deep' ? 'H*' : 'H'}</text></g>`,
      )
      continue
    }
    const compound = s.children.length > 0
    const title = compound
      ? `<text x="${x + 12}" y="${y + 18}" class="sy-title">${esc(s.key)}</text>`
      : `<text x="${x + w / 2}" y="${y + h / 2 + 4}" text-anchor="middle">${esc(s.key)}</text>`
    const final =
      s.type === 'final'
        ? `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="6" class="sy-inner"/>`
        : ''
    const dash = s.type === 'parallel' || regions.has(s.id) ? ' stroke-dasharray="6 4"' : ''
    out.push(
      `${g}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"${dash}/>${final}${title}</g>`,
    )
  }
  if (anyState) {
    const b = boxes.get('any')!
    out.push(
      `<g class="sy-any"><text x="${(b.x ?? 0) + 36}" y="${(b.y ?? 0) + 15}" text-anchor="middle">any state</text></g>`,
    )
  }
  for (const s of states(graph)) {
    if (!s.initial) continue
    const b = boxes.get(start(s.id))!
    out.push(`<circle class="sy-initial" cx="${(b.x ?? 0) + 5}" cy="${(b.y ?? 0) + 5}" r="5"/>`)
  }
  const transitionOf = new Map(graph.transitions.map((t, i) => [`t${i}`, t]))
  for (const e of (laid.edges ?? []) as ElkExtendedEdge[]) {
    const d = (e.sections ?? [])
      .map(sec =>
        [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint]
          .map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`)
          .join(' '),
      )
      .join(' ')
    const t = transitionOf.get(e.id)
    const label = e.labels?.[0]
    const text =
      t && label
        ? `<text x="${(label.x ?? 0) + 4}" y="${(label.y ?? 0) + 11}" class="sy-label">${esc(t.label)}</text>`
        : ''
    const data = t
      ? ` data-source="${esc(t.source)}" data-target="${esc(t.target ?? t.source)}" data-event="${esc(t.event)}"`
      : ''
    out.push(
      `<g class="sy-transition"${data}><path d="${d}" marker-end="url(#sy-arrow)"/>${text}</g>`,
    )
  }

  const [width, height] = [Math.ceil(laid.width ?? 0), Math.ceil(laid.height ?? 0)]
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="sy-diagram" role="img" aria-label="${esc(graph.name)} statechart">`,
    `<style>${STYLE}</style>`,
    '<defs><marker id="sy-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs>',
    ...out,
    '</svg>',
  ].join('\n')
}

const STYLE = [
  '.sy-diagram{font:12px ui-sans-serif,system-ui,sans-serif;color:#1e293b}',
  '.sy-state rect,.sy-state circle{fill:#fff;stroke:#64748b;stroke-width:1.25}',
  '.sy-state .sy-inner{fill:none}',
  '.sy-state text{fill:currentColor}',
  '.sy-title{font-weight:600}',
  '.sy-compound>rect,.sy-parallel>rect{fill:#f8fafc}',
  '.sy-active>rect,.sy-active>circle{fill:#e0e7ff;stroke:#4f46e5;stroke-width:2}',
  '.sy-initial{fill:#334155}',
  '.sy-transition path{fill:none;stroke:#64748b;stroke-width:1.25}',
  '#sy-arrow path{fill:#64748b}',
  '.sy-label{fill:#475569;font-size:11px}',
  '.sy-any text{fill:#64748b;font-style:italic}',
  '.sy-taken path{stroke:#4f46e5;stroke-width:2.5}',
  '@media (prefers-color-scheme:dark){.sy-diagram{color:#e2e8f0}.sy-state rect,.sy-state circle{fill:#0f172a;stroke:#94a3b8}.sy-compound>rect,.sy-parallel>rect{fill:#111827}.sy-active>rect,.sy-active>circle{fill:#312e81;stroke:#818cf8}.sy-label{fill:#cbd5e1}.sy-initial{fill:#cbd5e1}}',
].join('')
