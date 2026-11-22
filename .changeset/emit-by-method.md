---
'@switchyard-ts/core': minor
---

`emit()` and `on()` take the method an emitted event is named for: `this.emit(this.factClosed)` and
`m.on(m.factClosed, fn)` deliver and listen for `factClosed`, so TypeScript checks the name. Strings
keep working.
