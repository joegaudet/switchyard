# @switchyard/cli

```bash
npx switchyard diagram app/machines/fetch.ts [--format mermaid|dot|svg|interface] [--legacy]
npx switchyard export app/machines/fetch.ts --format xstate|scxml
npx switchyard import machine.json --name Fetch   # or machine.scxml
```

`--legacy` compiles decorators the way Ember apps do. `@switchyard/cli/vite` serves
`import chart from './fetch.ts?switchyard=svg'` at build time.

Guide: **https://joegaudet.com/switchyard/guide/#/diagrams** · MIT
