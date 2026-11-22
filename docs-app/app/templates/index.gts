import FetchDemo from 'docs-app/components/demos/fetch-demo'

<template>
  <h1>Getting started</h1>
  <p>
    Switchyard is a statechart library for Ember. A machine is a class: its states are
    <a href="https://joegaudet.com/real-enums/">real-enums</a> values, its events are decorated
    methods, and its context is ordinary <code>@tracked</code> fields. It runs on SCXML semantics,
    the same as xstate v5, and has everything xstate does: hierarchy, parallel regions, history,
    guards, delays, invoked and spawned actors.
  </p>
  <pre><code class="language-bash">npm install @switchyard-ts/core @switchyard-ts/ember @real-enums/core</code></pre>
  <p>
    Below is a whole machine. Press <em>Fetch</em> with the API down: it fails, and
    <em>Retry</em> resumes where it was (that is the <code>history</code> target). After three
    retries the guard says no, and the button disables itself, because <code>can</code> asks the
    machine. Untick the box and retry to succeed. The chart below it is the machine itself,
    drawn live.
  </p>
  <FetchDemo />
  <h2>What you just used</h2>
  <ul>
    <li><code>State.of('loading', &lbrace; children, history &rbrace;)</code>: states, nested, with history.</li>
    <li><code>@transition(&lbrace; from, to, guard &rbrace;)</code>: calling <code>fetch.retry()</code> sends the event; the method body is the action.</li>
    <li><code>@invoke</code>: async work that runs while a state is active, cancelled (its signal aborts) when it exits.</li>
    <li><code>@after</code>: a timer that belongs to a state.</li>
    <li><code>machine(this, new Fetch())</code>: starts it and stops it when the component goes away.</li>
  </ul>
  <p>Next: <a href="#/states">States</a>.</p>
</template>
