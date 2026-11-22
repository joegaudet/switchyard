# @switchyard-ts/skills

Installs the Switchyard authoring skill for coding agents.

```bash
npm i -D @switchyard-ts/skills && npx switchyard-skills
```

Writes `.claude/skills/switchyard/SKILL.md`: the DSL, its rules (synchronous event bodies, guards
as getters, `history()`), Ember usage and testing. Re-run after an upgrade to refresh it;
`--dry-run` lists what it would write.
