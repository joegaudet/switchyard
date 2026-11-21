// The compiled config's guards and actions carry their source names, so a diagram can label
// transitions from any config, decorated or written by hand.
import { expect, it } from 'vitest'
import type { TransitionConfig } from '../../src/index.js'
import { Counter, Fetch } from './machines.standard.js'

it('names guards and actions after the decorated members', () => {
  const failed = Fetch.toConfig().states!['failed']!.on!
  const [retry] = failed['retry'] as TransitionConfig[]
  expect(retry!.guard!.name).toBe('hasRetriesLeft && isOnline')
  expect(retry!.actions!.map(a => a.name)).toEqual(['retry'])
  const [giveUp] = failed['giveUp'] as TransitionConfig[]
  expect(giveUp!.guard!.name).toBe('!hasRetriesLeft')
  expect(Fetch.toConfig().states!['loading']!.entry!.map(a => a.name)).toEqual(['enterLoading'])
  expect(Counter.toConfig().states!['low']!.always![0]!.guard!.name).toBe('isHigh')
})
