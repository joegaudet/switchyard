// Copies the shipped skills into a repo's .claude/skills/.
import { cpSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'skills')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  )
}

/** Writes the skills into `<repo>/.claude/skills/`, replacing older copies. Returns the paths. */
export function install(repo: string, { dryRun = false }: { dryRun?: boolean } = {}): string[] {
  const target = join(repo, '.claude', 'skills')
  const written = files(assets).map(f => join(target, relative(assets, f)))
  if (!dryRun) cpSync(assets, target, { recursive: true })
  return written
}
