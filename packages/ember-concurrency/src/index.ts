import type { Task } from 'ember-concurrency'

/**
 * Performs an ember-concurrency task from an `@invoke` method. Leaving the state, or stopping
 * the machine, aborts `signal` and so cancels the task instance. With `@switchyard-ts/ember`
 * imported, `await settled()` waits for it.
 *
 *     @invoke(SearchState.Loading, { onDone: SearchState.Done, onError: SearchState.Failed })
 *     load(signal: AbortSignal) {
 *       return perform(signal, this.lookup, this.query)
 *     }
 *
 * A task cancelled some other way while the state is active (`cancelAll()`, a restartable
 * task performed again) rejects, so the machine takes `onError`.
 */
export function perform<T, A extends unknown[]>(
  signal: AbortSignal,
  task: Task<T, A>,
  ...args: A
): Promise<T> {
  const instance = task.perform(...args)
  signal.addEventListener('abort', () => void instance.cancel(), { once: true })
  // A real Promise, unlike the TaskInstance thenable, so @switchyard-ts/ember's invoke waiter tracks it.
  return Promise.resolve(instance)
}
