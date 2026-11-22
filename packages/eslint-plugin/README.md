# @switchyard-ts/eslint-plugin

```js
import switchyard from '@switchyard-ts/eslint-plugin'
export default [switchyard.configs.recommended]
```

`no-unreachable-state`, `no-unknown-guard`, `exhaustive-state-switch`, `state-brand` (each
`State` enum declares `private declare readonly brand: never`; fixable), `prefer-state-predicate`
(`tool.isSelect`, not `tool === Tool.Select`; fixable when the `@is()`/`@isNot()` predicate
exists). Each reads one file's
syntax: enums and machines declared in other files are not cross-checked.

Guide: **https://joegaudet.com/switchyard/guide/** · MIT
