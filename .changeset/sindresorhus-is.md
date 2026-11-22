---
'@switchyard/core': patch
'@switchyard/cli': patch
'@switchyard/graph': patch
'@switchyard/eslint-plugin': patch
'@switchyard/interop': patch
'@switchyard/test': patch
---

Runtime type checks use `@sindresorhus/is` instead of `typeof`, now a dependency of these
packages. A Standard Schema whose `~standard` is on a function (as some validators' are) is
recognised as one.
