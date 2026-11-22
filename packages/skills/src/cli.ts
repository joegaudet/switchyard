#!/usr/bin/env node
import { install } from './index.js'

const dryRun = process.argv.includes('--dry-run')
for (const f of install(process.cwd(), { dryRun }))
  console.log(`${dryRun ? 'would write' : 'wrote'} ${f}`)
