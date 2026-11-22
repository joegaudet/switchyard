# @switchyard-ts/ember-concurrency

## 0.2.0

### Minor Changes

- a957459: New package: `perform(signal, task, ...args)` runs an ember-concurrency task from an `@invoke` method. Leaving the state, or stopping the machine, cancels the task instance, and `await settled()` waits for it.

### Patch Changes

- @switchyard-ts/core@0.2.0
  - @switchyard-ts/ember@0.2.0
