import type { Action } from '../../src/interpreter.js'

/** Actions that record their name, so a test can assert the order things ran in. */
export function tracer() {
  const log: string[] = []
  const t =
    (name: string): Action =>
    () => {
      log.push(name)
    }
  return { log, t }
}
