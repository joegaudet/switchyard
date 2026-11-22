// Importing this module wires Switchyard into Ember: machine reads are tracked, @after timers
// and @invoke promises are test waiters, so `await settled()` waits for them.
import { tracked } from '@glimmer/tracking'
import { registerDestructor } from '@ember/destroyable'
import { buildWaiter, waitForPromise } from '@ember/test-waiters'
import { isString } from '@sindresorhus/is'
import { configure, type Clock, type Machine, type State } from '@switchyard-ts/core'

class Version {
  @tracked value = 0
}

const versions = new WeakMap<object, Version>()
// Plain counts, so dirty() only writes the tracked field: reading it there would make whatever
// is autotracking at the time (a resource's setup, a getter) depend on it and re-run.
const counts = new WeakMap<object, number>()
function version(machine: object): Version {
  let v = versions.get(machine)
  if (!v) versions.set(machine, (v = new Version()))
  return v
}

const waiter = buildWaiter('@switchyard-ts/ember:after')
const tokens = new Map<unknown, unknown>()

/** setTimeout with a test waiter per pending timer. A long `@after` holds `settled()` that long. */
const clock: Clock = {
  setTimeout(fn, ms) {
    const token = waiter.beginAsync()
    const handle = setTimeout(() => {
      tokens.delete(handle)
      waiter.endAsync(token)
      fn()
    }, ms)
    tokens.set(handle, token)
    return handle
  },
  clearTimeout(handle) {
    clearTimeout(handle as ReturnType<typeof setTimeout>)
    if (!tokens.has(handle)) return
    waiter.endAsync(tokens.get(handle))
    tokens.delete(handle)
  },
}

configure({
  reactivity: {
    consume: machine => void version(machine).value,
    dirty: machine => {
      const n = (counts.get(machine) ?? 0) + 1
      counts.set(machine, n)
      version(machine).value = n
    },
  },
  clock,
  track: promise => waitForPromise(promise),
})

/**
 * Starts `machine` and ties it to `owner`'s lifetime: destroying the owner (a component,
 * service or route) stops the machine, its timers and its actors.
 *
 *     fetch = machine(this, new Fetch())
 */
export function machine<M extends Machine<unknown>>(owner: object, instance: M): M {
  registerDestructor(owner, () => instance.stop())
  return instance.start()
}

/** `{{on "click" (send this.fetch "retry")}}`: a callback that sends the event. */
export function send(target: Machine<unknown>, event: string, ...args: unknown[]): () => void {
  return () => target.send(event, ...args)
}

/** `{{#if (matches this.fetch FetchState.Loading)}}` */
export function matches(target: Machine<unknown>, state: State): boolean {
  return target.matches(state)
}

/**
 * `<button disabled={{not (can this.fetch FetchState.Loading via=this.fetch.retry)}}>`: whether
 * an event (`via` alone, if given) would enter the state now. `(can this.fetch "retry")` also works.
 */
export function can(
  target: Machine<unknown>,
  to: State | string,
  options?: { via?: (...args: never[]) => unknown },
): boolean {
  return isString(to) ? (target.can[to] ?? false) : target.can(to, options)
}

export { announcement, SwitchyardAnnouncer } from './announcer.gts'
