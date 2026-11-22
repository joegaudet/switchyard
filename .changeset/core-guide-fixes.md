---
'@switchyard/core': minor
'@switchyard/graph': patch
'@switchyard/interop': minor
---

`@transition({ event })` names an event apart from its method (`event: 'stop'`, `'media.ended'`);
decorated methods may no longer shadow Machine's own members. In a parallel machine, a
transition with no `from` stays in its target's region instead of resetting every region.
Diagrams draw transitions handled in every state from an "any state" marker. Codegen uses
`event` for reserved and non-identifier event names.
