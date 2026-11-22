import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { eventSignatures, loadMachines, run } from '../src/index.js'
import { switchyard } from '../src/vite.js'

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

async function cli(...argv: string[]) {
  let out = ''
  const code = await run(argv, { write: s => void (out += s) })
  return { code, out }
}

describe('loadMachines', () => {
  it('imports a TypeScript module and finds its Machine classes', async () => {
    const machines = await loadMachines(fixture('fetch.ts'))
    expect([...machines.keys()]).toEqual(['Fetch'])
  })

  it('sees a change to a file the module imports, and the plugin watches that file', async () => {
    const dir = mkdtempSync(join(dirname(fixture('fetch.ts')), '.tmp-'))
    try {
      const states = (value: string) =>
        `import { State } from '@switchyard-ts/core'\nexport class S extends State {\n  static A = S.of('${value}')\n}\n`
      writeFileSync(join(dir, 'states.ts'), states('first'))
      writeFileSync(
        join(dir, 'm.ts'),
        `import { Machine, transition } from '@switchyard-ts/core'\nimport { S } from './states.ts'\nexport class M extends Machine<S> {\n  @transition({ to: S.A })\n  go() {}\n}\n`,
      )
      const top = async () =>
        Object.keys((await loadMachines(join(dir, 'm.ts'))).get('M')!.toConfig().states!)
      expect(await top()).toEqual(['first'])
      writeFileSync(join(dir, 'states.ts'), states('second'))
      expect(await top()).toEqual(['second'])

      const watched: string[] = []
      const ctx = { addWatchFile: (f: string) => void watched.push(f) }
      await (switchyard().load as (this: typeof ctx, id: string) => Promise<string | null>).call(
        ctx,
        `${join(dir, 'm.ts')}?switchyard=mermaid`,
      )
      expect(watched).toContain(join(dir, 'states.ts'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('compiles Ember-style legacy decorators with legacy: true', async () => {
    const machines = await loadMachines(fixture('signal.legacy.ts'), { legacy: true })
    expect(machines.get('Signal')!.toConfig().states!['red']!.on).toHaveProperty('go')
  })
})

describe('eventSignatures', () => {
  it('reads event methods’ parameters from the source', async () => {
    expect(await eventSignatures(fixture('fetch.ts'))).toEqual({
      Fetch: { fetch: '(url: string, options?: { retries: number })', resolve: '()' },
    })
  })
})

describe('switchyard', () => {
  it('diagram: Mermaid by default', async () => {
    const { code, out } = await cli('diagram', fixture('fetch.ts'))
    expect(code).toBe(0)
    expect(out).toMatch(/^stateDiagram-v2\n/)
    expect(out).toContain('idle --> loading : fetch')
  })

  it('diagram --format interface: with payload types from the source', async () => {
    const { out } = await cli('diagram', fixture('fetch.ts'), '--format', 'interface')
    expect(out).toContain('+fetch(url: string, options?: { retries: number }) idle')
  })

  it('diagram --format svg and dot', async () => {
    expect((await cli('diagram', fixture('fetch.ts'), '--format', 'svg')).out).toMatch(/^<svg /)
    expect((await cli('diagram', fixture('fetch.ts'), '--format', 'dot')).out).toMatch(/^digraph /)
  })

  it('export: xstate JSON and SCXML', async () => {
    const xstate = JSON.parse((await cli('export', fixture('fetch.ts'), '--format', 'xstate')).out)
    expect(xstate).toMatchObject({ id: 'Fetch', initial: 'idle' })
    expect((await cli('export', fixture('fetch.ts'), '--format', 'scxml')).out).toContain('<scxml')
  })

  it('import: an xstate JSON or SCXML file as a decorated class', async () => {
    const fromJson = (await cli('import', fixture('player.json'), '--name', 'Player')).out
    expect(fromJson).toContain('export class Player extends Machine<PlayerState>')
    const fromScxml = (await cli('import', fixture('door.scxml'), '--name', 'Door')).out
    expect(fromScxml).toContain("guard: 'unlocked'")
    expect(fromScxml).toContain('export class Door extends Machine<DoorState>')
  })

  it('names the machine to use when a module has several, and explains errors', async () => {
    expect(await cli('diagram', fixture('fetch.ts'), '--export', 'Nope')).toMatchObject({
      code: 1,
      out: expect.stringMatching(/no Machine export "Nope".*Fetch/),
    })
    expect((await cli('frobnicate')).out).toMatch(/Usage: switchyard/)
  })
})

describe('vite plugin', () => {
  it('serves ?switchyard=<format> imports as strings, and watches the source', async () => {
    const plugin = switchyard()
    const watched: string[] = []
    const ctx = { addWatchFile: (f: string) => void watched.push(f) }
    const id = `${fixture('fetch.ts')}?switchyard=mermaid`
    const code = await (
      plugin.load as (this: typeof ctx, id: string) => Promise<string | null>
    ).call(ctx, id)
    expect(code).toMatch(/^export default "stateDiagram-v2\\n/)
    expect(watched).toEqual([fixture('fetch.ts')])
    expect(
      await (plugin.load as (this: typeof ctx, id: string) => Promise<string | null>).call(
        ctx,
        fixture('fetch.ts'),
      ),
    ).toBeNull()
  })
})
