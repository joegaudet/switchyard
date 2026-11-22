---
'@switchyard-ts/core': patch
'@switchyard-ts/cli': patch
'@switchyard-ts/graph': patch
'@switchyard-ts/eslint-plugin': patch
'@switchyard-ts/interop': patch
'@switchyard-ts/test': patch
---

Runtime type checks use `@sindresorhus/is` instead of `typeof`, now a dependency of these
packages. A Standard Schema whose `~standard` is on a function (as some validators' are) is
recognised as one.
