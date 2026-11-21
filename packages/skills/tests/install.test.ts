import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { install } from '../src/index.js'

describe('install', () => {
  it('writes the skill into .claude/skills, and reports what it wrote', () => {
    const repo = mkdtempSync(join(tmpdir(), 'switchyard-skills-'))
    const written = install(repo)
    const skill = join(repo, '.claude/skills/switchyard/SKILL.md')
    expect(written).toEqual([skill])
    expect(readFileSync(skill, 'utf8')).toMatch(/^---\nname: switchyard\ndescription: /)
  })

  it('--dry-run writes nothing', () => {
    const repo = mkdtempSync(join(tmpdir(), 'switchyard-skills-'))
    expect(install(repo, { dryRun: true })).toHaveLength(1)
    expect(existsSync(join(repo, '.claude'))).toBe(false)
  })
})
