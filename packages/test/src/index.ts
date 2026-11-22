// Testing Switchyard machines: model paths for model-based tests, transition coverage,
// matchers for vitest/jest and QUnit, and a manual clock.
import { isString } from '@sindresorhus/is'
import { manualClock, type Machine, type Clock, type State } from '@switchyard/core'
import { states, toGraph, type MachineClass } from '@switchyard/graph'

export { manualClock }

export interface ModelEvent {
  type: string
  args?: unknown[]
}

export interface PathStep {
  event: string
  args: unknown[]
  /** Active leaf states after the event. */
  state: string[]
}

export interface ModelPath {
  /** Active leaf states at the end of the path. */
  state: string[]
  steps: PathStep[]
}

export interface PathOptions<M extends Machine<unknown>> {
  /** Events to try, with arguments. Defaults to every event method of the machine's class. */
  events?: (string | ModelEvent)[]
  /** What makes two states the same. Defaults to the active configuration. */
  key?: (machine: M) => string
  /** The longest path explored. */
  maxDepth?: number
}

const internalEvent = /^(always|after |done: |error: )/

function setup<M extends Machine<unknown>>(create: () => M, options: PathOptions<M>) {
  const events: ModelEvent[] = (
    options.events ?? [
      ...new Set(
        toGraph(create().constructor as MachineClass)
          .transitions.map(t => t.event)
          .filter(e => !internalEvent.test(e)),
      ),
    ]
  ).map(e => (isString(e) ? { type: e } : e))
  const key = options.key ?? (m => m.snapshot().configuration.join(' '))
  // Replaying from a fresh machine keeps guards that read context honest.
  const replay = (steps: PathStep[]) => {
    const m = create()
    for (const s of steps) m.send(s.event, ...s.args)
    return m
  }
  const next = (steps: PathStep[], m: M) =>
    events
      .filter(e => m.can[e.type])
      .map(e => {
        const after = replay([...steps, { event: e.type, args: e.args ?? [], state: [] }])
        const step: PathStep = {
          event: e.type,
          args: e.args ?? [],
          state: after.snapshot().configuration,
        }
        return { steps: [...steps, step], machine: after }
      })
  return { key, replay, next, maxDepth: options.maxDepth ?? 25 }
}

const toPath = (steps: PathStep[], state: string[]): ModelPath => ({ state, steps })

/** One shortest event path to every reachable state, breadth first. */
export function shortestPaths<M extends Machine<unknown>>(
  create: () => M,
  options: PathOptions<M> = {},
): ModelPath[] {
  const { key, replay, next, maxDepth } = setup(create, options)
  const start = replay([])
  const seen = new Map([[key(start), toPath([], start.snapshot().configuration)]])
  let frontier = [{ steps: [] as PathStep[], machine: start }]
  for (let depth = 0; frontier.length && depth < maxDepth; depth++) {
    const following: typeof frontier = []
    for (const { steps, machine } of frontier) {
      for (const n of next(steps, machine)) {
        const k = key(n.machine)
        if (seen.has(k)) continue
        seen.set(k, toPath(n.steps, n.machine.snapshot().configuration))
        following.push(n)
      }
    }
    frontier = following
  }
  return [...seen.values()]
}

/** Every path from the start that never revisits a state, depth first. */
export function simplePaths<M extends Machine<unknown>>(
  create: () => M,
  options: PathOptions<M> & { limit?: number } = {},
): ModelPath[] {
  const { key, replay, next, maxDepth } = setup(create, options)
  const limit = options.limit ?? 1000
  const out: ModelPath[] = []
  const visit = (steps: PathStep[], machine: M, onPath: Set<string>) => {
    if (out.length >= limit || steps.length >= maxDepth) return
    for (const n of next(steps, machine)) {
      const k = key(n.machine)
      if (onPath.has(k)) continue
      out.push(toPath(n.steps, n.machine.snapshot().configuration))
      visit(n.steps, n.machine, new Set(onPath).add(k))
    }
  }
  const start = replay([])
  visit([], start, new Set([key(start)]))
  return out
}

export interface CoverageReport {
  states: { covered: number; total: number; missing: string[] }
  transitions: { covered: number; total: number; missing: string[] }
  toString(): string
}

// The graph names events as diagrams do; a microstep names them as the runtime does.
function graphEvent(type: string): string {
  const after = /^xstate\.after\.([^.]+)\./.exec(type)
  if (after) return /^\d+$/.test(after[1]!) ? `after ${after[1]}ms` : `after ${after[1]}`
  const done = /^xstate\.done\.actor\.(.+)$/.exec(type)
  if (done) return `done: ${done[1]}`
  const error = /^xstate\.error\.actor\.(.+)$/.exec(type)
  if (error) return `error: ${error[1]}`
  return type
}

/** Which of a machine class's states and transitions the tracked machines reached. */
export function coverage(Class: MachineClass) {
  const graph = toGraph(Class)
  const allStates = states(graph)
    .slice(1)
    .filter(s => s.type !== 'history')
    .map(s => s.id)
  const label = (t: (typeof graph.transitions)[number]) =>
    `${t.source || '(root)'} -> ${t.target ?? t.source}: ${t.label}`
  const byKey = new Map<string, string[]>()
  for (const t of graph.transitions) {
    const k = `${t.source}|${t.target ?? t.source}|${t.event}`
    byKey.set(k, [...(byKey.get(k) ?? []), label(t)])
  }
  const seenStates = new Set<string>()
  const seenTransitions = new Set<string>()

  return {
    /** Records what `machine` does from now on. Returns a function that stops recording. */
    track(machine: Machine<unknown>): () => void {
      const record = () => {
        for (const leaf of machine.snapshot().configuration) {
          const parts = leaf.split('.')
          parts.forEach((_, i) => seenStates.add(parts.slice(0, i + 1).join('.')))
        }
      }
      const offInspect = machine.inspect(e => {
        if (e.type !== '@xstate.microstep') return
        for (const t of e.transitions) {
          const target = t.targets[0] ?? t.source
          const exact = byKey.get(`${t.source}|${target}|${graphEvent(e.event.type)}`)
          // An eventless step reports the event that led to it, so fall back to `always`.
          for (const l of exact ?? byKey.get(`${t.source}|${target}|always`) ?? [])
            seenTransitions.add(l)
        }
      })
      const offSubscribe = machine.subscribe(record)
      record()
      return () => {
        offInspect()
        offSubscribe()
      }
    },
    report(): CoverageReport {
      const transitions = [...byKey.values()].flat()
      const report = {
        states: {
          covered: allStates.filter(s => seenStates.has(s)).length,
          total: allStates.length,
          missing: allStates.filter(s => !seenStates.has(s)),
        },
        transitions: {
          covered: transitions.filter(t => seenTransitions.has(t)).length,
          total: transitions.length,
          missing: graph.transitions.map(label).filter(t => !seenTransitions.has(t)),
        },
      }
      return {
        ...report,
        toString: () =>
          `states ${report.states.covered}/${report.states.total}, transitions ${report.transitions.covered}/${report.transitions.total}` +
          [
            ...report.states.missing.map(s => `\n  state not reached: ${s}`),
            ...report.transitions.missing.map(t => `\n  transition not taken: ${t}`),
          ].join(''),
      }
    },
  }
}

/** Gives `Class` (and its subclasses) a manual clock: `clock.advance(ms)` fires `@after`. */
export function useManualClock(Class: { clock?: Clock }): ReturnType<typeof manualClock> {
  const clock = manualClock()
  Class.clock = clock
  return clock
}

const where = (m: Machine<unknown>) => m.snapshot().configuration.join(', ') || '(no state)'

/**
 * The matchers' types. Merge them into your runner's matcher interface (its declaration's
 * exact type parameters, e.g. vitest's `Matchers<R, T>`), or cast: `expect(m) as SwitchyardMatchers<void>`.
 */
export interface SwitchyardMatchers<R> {
  toBeIn(state: State): R
}

/** Vitest/Jest matchers: `expect.extend(matchers)`, then `expect(m).toBeIn(State.X)`. */
export const matchers = {
  toBeIn(received: Machine<unknown>, state: State) {
    const pass = received.matches(state)
    return {
      pass,
      message: () =>
        `expected ${received.constructor.name} ${pass ? 'not ' : ''}to be in ${state.value}, but it is in ${where(received)}`,
    }
  },
}

interface PushResult {
  pushResult(result: { result: boolean; actual: unknown; expected: unknown; message: string }): void
}

/** Adds `assert.machineIn(machine, state, message?)` to a QUnit `assert`. Returns it. */
export function setupMachineAssertions<A extends PushResult>(
  assert: A,
): A & { machineIn(machine: Machine<unknown>, state: State, message?: string): void } {
  return Object.assign(assert, {
    machineIn(machine: Machine<unknown>, state: State, message?: string) {
      assert.pushResult({
        result: machine.matches(state),
        actual: where(machine),
        expected: state.value,
        message: message ?? `${machine.constructor.name} is in ${state.value}`,
      })
    },
  })
}
