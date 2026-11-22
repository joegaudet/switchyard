// Needs ember-resources (an optional peer). Kept out of the main entrypoint for that reason.
import { resource, resourceFactory } from 'ember-resources'
import type { Machine } from '@switchyard-ts/core'

/**
 * A machine as a resource: started when first read, stopped when the resource is torn down
 * (its template block or owning object goes away). `{{#let (machineResource Fetch) as |fetch|}}`
 */
export const machineResource: <M extends Machine<unknown>, A extends unknown[]>(
  Class: new (...args: A) => M,
  ...args: A
) => M = resourceFactory(
  // resourceFactory's own type drops the generics, so the signature is declared above.
  (Class: new (...args: unknown[]) => Machine<unknown>, ...args: unknown[]) =>
    resource(({ on }) => {
      const instance = new Class(...args)
      on.cleanup(() => instance.stop())
      return instance.start()
    }),
) as never
