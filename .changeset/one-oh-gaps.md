---
'@switchyard-ts/core': minor
'@switchyard-ts/graph': patch
'@switchyard-ts/test': patch
---

Closing xstate parity gaps: parallel regions inside a state (`State.of(v, { regions })`),
`waitFor` and `toPromise`, and named delays (`@after('getterName')`, read on entry).
