import WizardDemo from 'docs-app/components/demos/wizard-demo'

<template>
  <h1>Diagrams</h1>
  <p>
    Every chart in this guide is drawn from the class itself: no second source of truth to keep in
    step. <code>@switchyard-ts/graph</code> reads a machine and draws it.
  </p>
  <pre><code class="language-typescript">import &lbrace; toGraph, toMermaid, toDot, toSvg, describeInterface, interfaceToMermaid, topology &rbrace; from '@switchyard-ts/graph'

toMermaid(toGraph(Fetch))          // stateDiagram-v2, renders in GitHub READMEs and PRs
toDot(toGraph(Fetch))              // Graphviz
await toSvg(toGraph(Fetch))        // laid out by ELK, as on this page
interfaceToMermaid(describeInterface(Fetch)) // events, guards, actions, invokes
topology(uploader)                 // the live tree of spawned and invoked machines</code></pre>
  <h2>Live, in your app</h2>
  <p>
    <code>&lt;SwitchyardDebug @machine=\{{this.wizard}} /&gt;</code> from
    <code>@switchyard-ts/ember/debug</code> draws the machine and follows it: the active states light
    up, and each transition flashes as it is taken. Outside Ember, it is the
    <code>&lt;switchyard-diagram&gt;</code> element from <code>@switchyard-ts/graph/viewer</code>.
  </p>
  <h2>From the command line, or at build time</h2>
  <pre><code class="language-bash">npx switchyard diagram app/machines/fetch.ts --legacy                 # Mermaid
npx switchyard diagram app/machines/fetch.ts --legacy --format svg > fetch.svg
npx switchyard diagram app/machines/fetch.ts --legacy --format interface  # with payload types</code></pre>
  <p>
    With the Vite plugin, <code>import chart from './fetch.ts?switchyard=svg'</code> renders a
    machine at build time.
  </p>
  <WizardDemo />
</template>
