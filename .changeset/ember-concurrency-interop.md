---
'@switchyard-ts/ember-concurrency': minor
---

New package: `perform(signal, task, ...args)` runs an ember-concurrency task from an `@invoke` method. Leaving the state, or stopping the machine, cancels the task instance, and `await settled()` waits for it.
