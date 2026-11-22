// Model-based tests: the machine is the model, a harness drives the real UI. Each path the
// model can take becomes a test that fires its events through the harness and checks the UI
// after every step. Runner-agnostic: register `name` and `run` with any runner harnessed supports.
import type { Machine } from '@switchyard-ts/core'
import { shortestPaths, simplePaths, type ModelPath } from '@switchyard-ts/test'

/** Options for {@link modelTests}: the model, and how to drive and check the UI through a harness. */
export interface ModelTestOptions<M extends Machine<unknown>, H> {
  /** A fresh model machine. */
  machine: () => M
  /** How the user makes each event happen, through the harness. */
  events: Record<string, (harness: H, ...args: unknown[]) => unknown>
  /** What the UI must show in each state, keyed by its active leaf paths (space-separated). */
  states: Record<string, (harness: H) => unknown>
  /** `shortest` (default): one path per state. `simple`: every path that revisits nothing. */
  paths?: 'shortest' | 'simple'
}

/** One generated test: register `name` and `run` with the test runner. */
export interface ModelTest<H> {
  name: string
  path: ModelPath
  /** Checks the start state, then fires each event of the path and checks the state after it. */
  run(harness: H): Promise<void>
}

const key = (state: string[]) => state.join(' ')

/**
 * One test per path through the model machine. Throws up front if an event on any path has no
 * driver in `events`, or a state it reaches has no check in `states`.
 */
export function modelTests<M extends Machine<unknown>, H>(
  options: ModelTestOptions<M, H>,
): ModelTest<H>[] {
  const paths =
    options.paths === 'simple' ? [...simplePaths(options.machine)] : shortestPaths(options.machine)
  if (options.paths === 'simple') {
    // Simple paths start after the first event; the start state is a test of its own.
    const start = options.machine()
    paths.unshift({ state: start.snapshot().configuration, steps: [] })
  }
  for (const p of paths) {
    for (const s of p.steps)
      if (!options.events[s.event]) throw new Error(`modelTests: no driver for event "${s.event}"`)
    if (!options.states[key(p.state)])
      throw new Error(`modelTests: no check for state "${key(p.state)}"`)
  }
  return paths.map(path => ({
    name: [...path.steps.map(s => s.event), key(path.state)].join(' → '),
    path,
    async run(harness: H) {
      const check = async (state: string[], after: string) => {
        try {
          await options.states[key(state)]!(harness)
        } catch (error) {
          throw new Error(`${after}, expected ${key(state)}: ${(error as Error).message}`, {
            cause: error,
          })
        }
      }
      const start = options.machine().snapshot().configuration
      await check(start, 'at the start')
      for (const [i, step] of path.steps.entries()) {
        await options.events[step.event]!(harness, ...step.args)
        await check(
          step.state,
          `after ${path.steps
            .slice(0, i + 1)
            .map(s => s.event)
            .join(' → ')}`,
        )
      }
    },
  }))
}
