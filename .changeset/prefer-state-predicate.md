---
'@switchyard-ts/eslint-plugin': minor
---

New rule `prefer-state-predicate` (in `recommended`): compare states with their `@is()`/`@isNot()`
predicate, `tool.isSelect`, not `tool === Tool.Select`. It fixes the comparison when the predicate
exists, and otherwise names the one to add. Like the other rules, it knows the State enums declared
in the same file.
