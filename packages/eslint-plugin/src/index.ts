// ESLint rules for Switchyard. They read one file's syntax: State enums (`class X extends
// State` with `static Y = X.of('y')`) and machines (`class M extends Machine`) declared in it.
import type { Rule } from 'eslint'

interface N {
  type: string
  [key: string]: unknown
}

const node = (v: unknown) => v as N
const isNode = (v: unknown): v is N =>
  typeof v === 'object' && v !== null && typeof (v as N).type === 'string'

function walk(root: N, visit: (n: N, ancestors: N[]) => void, ancestors: N[] = []) {
  visit(root, ancestors)
  for (const [key, value] of Object.entries(root)) {
    if (key === 'parent') continue
    for (const child of Array.isArray(value) ? value : [value])
      if (isNode(child)) walk(child, visit, [...ancestors, root])
  }
}

const name = (n: unknown): string | undefined => {
  const x = node(n)
  return x?.type === 'Identifier' ? (x['name'] as string) : undefined
}
const superName = (cls: N) => name(cls['superClass'])

/** `E.M` → ['E', 'M'] */
function memberRef(n: unknown): [string, string] | undefined {
  const x = node(n)
  if (x?.type !== 'MemberExpression' || x['computed']) return undefined
  const object = name(x['object'])
  const property = name(x['property'])
  return object && property ? [object, property] : undefined
}

/** Every `class E extends State` in the file, with its members in declaration order. */
function stateEnums(program: N): Map<string, string[]> {
  const enums = new Map<string, string[]>()
  walk(program, n => {
    if (n.type !== 'ClassDeclaration' || superName(n) !== 'State') return
    const cls = name(n['id'])!
    const members: string[] = []
    for (const m of node(n['body'])['body'] as N[]) {
      const value = node(m['value'])
      const callee = value?.type === 'CallExpression' ? memberRef(value['callee']) : undefined
      if (
        m.type === 'PropertyDefinition' &&
        m['static'] &&
        callee?.[0] === cls &&
        callee[1] === 'of'
      )
        members.push(name(m['key'])!)
    }
    enums.set(cls, members)
  })
  return enums
}

const noUnreachableState: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Report State members that no machine in the file can ever enter' },
    schema: [],
  },
  create(context) {
    return {
      'Program:exit'(program) {
        const root = node(program)
        const enums = stateEnums(root)
        const used = new Set<string>()
        const targeted = new Set<string>()
        walk(root, (n, ancestors) => {
          const ref = memberRef(n)
          if (
            ref &&
            enums.has(ref[0]) &&
            ancestors.some(a => a.type === 'ClassDeclaration' && superName(a) === 'Machine')
          )
            used.add(ref[0])
          if (n.type !== 'Property' || !['to', 'onDone', 'onError'].includes(name(n['key']) ?? ''))
            return
          let value = node(n['value'])
          if (value.type === 'CallExpression' && name(value['callee']) === 'history')
            value = node((value['arguments'] as N[])[0])
          const target = memberRef(value)
          if (target) targeted.add(target.join('.'))
        })
        walk(root, n => {
          if (n.type !== 'ClassDeclaration' || superName(n) !== 'State') return
          const cls = name(n['id'])!
          if (!used.has(cls)) return
          const [, ...rest] = enums.get(cls)!
          for (const m of node(n['body'])['body'] as N[]) {
            const member = name(m['key'])
            if (member && rest.includes(member) && !targeted.has(`${cls}.${member}`))
              context.report({
                node: m as never,
                message: `${cls}.${member} is never entered: it is not the first state, and nothing targets it.`,
              })
          }
        })
      },
    }
  },
}

const noUnknownGuard: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Report guard names that are not members of the machine class' },
    schema: [],
  },
  create(context) {
    return {
      ClassDeclaration(cls) {
        const c = node(cls)
        // A subclass of another machine may inherit its getters; only direct Machines are checked.
        if (superName(c) !== 'Machine') return
        const members = new Set(
          (node(c['body'])['body'] as N[]).map(m => name(m['key'])).filter(Boolean),
        )
        const check = (value: N) => {
          if (value.type === 'Literal' && typeof value['value'] === 'string') {
            if (!members.has(value['value']))
              context.report({
                node: value as never,
                message: `Guard "${value['value']}" is not a getter, field or method of ${name(c['id'])}.`,
              })
          } else if (
            value.type === 'CallExpression' &&
            ['and', 'or', 'not'].includes(name(value['callee']) ?? '')
          )
            for (const arg of value['arguments'] as N[]) check(arg)
        }
        walk(c, n => {
          if (n.type === 'Property' && name(n['key']) === 'guard') check(node(n['value']))
        })
      },
    }
  },
}

const exhaustiveStateSwitch: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a switch on `.state` to handle every member, or have a default' },
    schema: [],
  },
  create(context) {
    let enums = new Map<string, string[]>()
    return {
      Program(program) {
        enums = stateEnums(node(program))
      },
      SwitchStatement(statement) {
        const s = node(statement)
        const discriminant = node(s['discriminant'])
        if (discriminant.type !== 'MemberExpression' || name(discriminant['property']) !== 'state')
          return
        const cases = s['cases'] as N[]
        if (cases.some(c => c['test'] === null)) return
        const refs = cases.map(c => memberRef(c['test'])).filter(r => r && enums.has(r[0])) as [
          string,
          string,
        ][]
        if (!refs.length) return
        const cls = refs[0]![0]
        const handled = new Set(refs.filter(r => r[0] === cls).map(r => r[1]))
        const missing = enums.get(cls)!.filter(m => !handled.has(m))
        if (missing.length)
          context.report({
            node: statement,
            message: `switch on ${context.sourceCode.getText(discriminant as never)} misses ${missing.map(m => `${cls}.${m}`).join(', ')}; add them or a default.`,
          })
      },
    }
  },
}

const rules = {
  'no-unreachable-state': noUnreachableState,
  'no-unknown-guard': noUnknownGuard,
  'exhaustive-state-switch': exhaustiveStateSwitch,
}

const plugin = {
  meta: { name: '@switchyard/eslint-plugin' },
  rules,
  configs: {} as Record<string, unknown>,
}

/** Flat config: `export default [switchyard.configs.recommended]`. */
plugin.configs['recommended'] = {
  plugins: { switchyard: plugin },
  rules: {
    'switchyard/no-unreachable-state': 'error',
    'switchyard/no-unknown-guard': 'error',
    'switchyard/exhaustive-state-switch': 'warn',
  },
}

export default plugin
