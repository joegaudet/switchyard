// The switchyard command's engine: load machine modules, render or convert them.
import { isFunction } from '@sindresorhus/is'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { build } from 'esbuild'
import type { MachineConfig } from '@switchyard/core'
import {
  describeInterface,
  interfaceToMermaid,
  toDot,
  toGraph,
  toMermaid,
  toSvg,
  type MachineClass,
} from '@switchyard/graph'
import { fromScxml, toClassSource, toScxml, toXState, type XStateNode } from '@switchyard/interop'

export interface LoadOptions {
  /** Compile decorators with legacy semantics, as Ember apps do. */
  legacy?: boolean
  /** Called with each file the bundle was built from: the module and its relative imports. */
  watch?: (file: string) => void
}

// The bundle lives under the project's node_modules, so its bare imports resolve there.
function cacheDir(file: string) {
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules')))
      return join(dir, 'node_modules', '.cache', 'switchyard')
    if (dirname(dir) === dir) return join(dirname(file), '.switchyard-cache')
  }
}

/** Compiles and imports a TypeScript module; returns its Machine class exports by name. */
export async function loadMachines(file: string, { legacy = false, watch }: LoadOptions = {}) {
  const path = resolve(file)
  const dir = cacheDir(path)
  mkdirSync(dir, { recursive: true })
  // Built every time, since any file it imports can change; named by its output, so an unchanged
  // bundle is imported from Node's module cache rather than evaluated again.
  const result = await build({
    entryPoints: [path],
    write: false,
    metafile: true,
    outdir: dir,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    logLevel: 'silent',
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: legacy, useDefineForClassFields: !legacy },
    },
  })
  for (const input of Object.keys(result.metafile.inputs)) watch?.(resolve(input))
  const code = result.outputFiles[0]!.contents
  const outfile = join(dir, `${createHash('sha1').update(code).digest('hex').slice(0, 12)}.mjs`)
  if (!existsSync(outfile)) writeFileSync(outfile, code)
  const module = (await import(pathToFileURL(outfile).href)) as Record<string, unknown>
  const machines = new Map<string, MachineClass>()
  for (const [name, value] of Object.entries(module))
    if (
      isFunction(value) &&
      isFunction((value as Partial<MachineClass>).toConfig) &&
      value.name !== 'Machine'
    )
      machines.set(name, value as MachineClass)
  return machines
}

/**
 * Each Machine class's method parameter lists, read from the source with the TypeScript
 * compiler (an optional peer): `{ Fetch: { fetch: '(url: string)' } }`.
 */
export async function eventSignatures(
  file: string,
): Promise<Record<string, Record<string, string>>> {
  const ts = (await import('typescript')).default
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const out: Record<string, Record<string, string>> = {}
  sf.forEachChild(node => {
    if (!ts.isClassDeclaration(node) || !node.name) return
    const methods: Record<string, string> = {}
    for (const m of node.members) {
      if (!ts.isMethodDeclaration(m) || !ts.isIdentifier(m.name)) continue
      methods[m.name.text] = `(${m.parameters.map(p => p.getText(sf)).join(', ')})`
    }
    if (Object.keys(methods).length) out[node.name.text] = methods
  })
  return out
}

export type DiagramFormat = 'mermaid' | 'dot' | 'svg' | 'interface' | 'xstate' | 'scxml'

/** One machine of a module as text: a diagram, or xstate/SCXML. */
export async function render(
  file: string,
  format: DiagramFormat,
  options: LoadOptions & { exportName?: string } = {},
) {
  const machines = await loadMachines(file, options)
  const name = options.exportName ?? [...machines.keys()][0]
  const Class = name ? machines.get(name) : undefined
  if (!Class)
    throw new Error(
      `${file} has no Machine export${options.exportName ? ` "${options.exportName}"` : 's'} (found: ${[...machines.keys()].join(', ') || 'none'})`,
    )
  switch (format) {
    case 'mermaid':
      return toMermaid(toGraph(Class, name))
    case 'dot':
      return toDot(toGraph(Class, name))
    case 'svg':
      return `${await toSvg(toGraph(Class, name))}\n`
    case 'xstate':
      return `${JSON.stringify(toXState(Class, name), null, 2)}\n`
    case 'scxml':
      return toScxml(Class, name)
    case 'interface': {
      const signatures =
        extname(file) === '.ts' ? (await eventSignatures(file))[Class.name] : undefined
      return interfaceToMermaid(describeInterface(Class, name), signatures)
    }
  }
}

/** An xstate JSON or SCXML file as decorated-class source. */
export function importSource(file: string, name?: string): string {
  const text = readFileSync(file, 'utf8')
  let json: XStateNode
  if (extname(file) === '.scxml' || text.trimStart().startsWith('<')) {
    // Codegen needs structure only; conds become getter stubs named after them.
    const anyGuard = new Proxy({}, { get: () => () => false })
    json = methodEvents(
      toXState(fromScxml(text, { guards: anyGuard }) as MachineConfig, name ?? 'machine'),
    )
  } else json = JSON.parse(text) as XStateNode
  return toClassSource(json, name)
}

// SCXML import writes `open` as `open open.*` (prefix matching). As a class, the event is the
// method `open`; a dotted `open.x` event cannot be a method call anyway.
function methodEvents(node: XStateNode): XStateNode {
  return {
    ...node,
    ...(node.on
      ? {
          on: Object.fromEntries(
            Object.entries(node.on).map(([k, v]) => [k.replace(/^(\S+) \1\.\*$/, '$1'), v]),
          ),
        }
      : {}),
    ...(node.states
      ? {
          states: Object.fromEntries(
            Object.entries(node.states).map(([k, v]) => [k, methodEvents(v)]),
          ),
        }
      : {}),
  }
}

const USAGE = `Usage: switchyard <command> <file> [options]

Commands:
  diagram <module.ts>   Draw a machine: --format mermaid (default) | dot | svg | interface
  export <module.ts>    Convert a machine: --format xstate (default) | scxml
  import <file>         Generate a decorated class from xstate JSON or SCXML (--name Class)

Options:
  --export <Name>       Which Machine export to use (default: the first)
  --legacy              Compile decorators with legacy semantics, as Ember apps do
`

/** The CLI, testable: returns the exit code and writes to `out`. */
export async function run(argv: string[], out: { write(s: string): void }): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: 'string' },
        export: { type: 'string' },
        name: { type: 'string' },
        legacy: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
  } catch (error) {
    out.write(`${(error as Error).message}\n\n${USAGE}`)
    return 1
  }
  const { values, positionals } = parsed
  const [command, file] = positionals
  if (values.help || !command || !file || !['diagram', 'export', 'import'].includes(command)) {
    out.write(USAGE)
    return values.help ? 0 : 1
  }
  try {
    if (command === 'import') out.write(importSource(file, values.name))
    else {
      const format = (values.format ??
        (command === 'diagram' ? 'mermaid' : 'xstate')) as DiagramFormat
      const allowed =
        command === 'diagram' ? ['mermaid', 'dot', 'svg', 'interface'] : ['xstate', 'scxml']
      if (!allowed.includes(format))
        throw new Error(`--format must be one of ${allowed.join(', ')}`)
      out.write(
        await render(file, format, {
          legacy: values.legacy ?? false,
          ...(values.export ? { exportName: values.export } : {}),
        }),
      )
    }
    return 0
  } catch (error) {
    out.write(`switchyard: ${(error as Error).message}\n`)
    return 1
  }
}
