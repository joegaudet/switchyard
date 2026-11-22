---
'@switchyard/core': patch
'@switchyard/interop': patch
'@switchyard/cli': patch
---

Fixes from the pre-release review. `toClassSource` (and `switchyard import`) writes every name
from an xstate or SCXML file as an escaped literal, an identifier or a one-line comment, so an
imported file can't add code to the generated class. A machine with a named `@after` delay can
`restore()` and validate its snapshots. `can` never raises `error.execution` when a guard throws,
and `m.can.method` answers for a method whose `event:` names it apart. The CLI rebuilds when a
file the machine module imports changes, and the Vite plugin watches those files.
