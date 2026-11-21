<template>
  <h1>xstate and SCXML</h1>
  <p>Switchyard runs the same semantics as xstate v5, and <code>@switchyard/interop</code> moves machines between them.</p>
  <ul>
    <li><code>toXState(Fetch)</code>: xstate JSON, for Stately Studio and its visualiser. Checked against xstate itself: the same events give the same states.</li>
    <li><code>fromXState(json, implementations)</code>: run an xstate config on Switchyard.</li>
    <li><code>toClassSource(json)</code>: generate a decorated class from an xstate config, the start of a migration. <code>npx switchyard import machine.json --name Fetch</code> does the same.</li>
    <li><code>toScxml(Fetch)</code> and <code>fromScxml(xml)</code>: the W3C format, round-tripped exactly.</li>
  </ul>
  <h2>The Stately Inspector</h2>
  <pre><code class="language-typescript">import &lbrace; createBrowserInspector &rbrace; from '@statelyai/inspect'
import &lbrace; connectInspector &rbrace; from '@switchyard/inspector'

connectInspector(this.fetch, createBrowserInspector())</code></pre>
  <p>The machine, and every machine it spawns or invokes, shows up in the inspector, live.</p>
</template>
