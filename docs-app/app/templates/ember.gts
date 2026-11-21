<template>
  <h1>In Ember</h1>
  <p>Import <code>@switchyard/ember</code> once, in your app. That one import makes machines tracked and their timers and invokes test waiters.</p>
  <pre><code class="language-typescript">// app/app.ts
import '@switchyard/ember'</code></pre>
  <h2>In a component</h2>
  <pre><code class="language-handlebars">import &lbrace; machine, send, can, matches &rbrace; from '@switchyard/ember'

export default class UserCard extends Component &lbrace;
  fetch = machine(this, new Fetch()) // started now, stopped when the component is destroyed

  &lt;template&gt;
    \{{#if this.fetch.state.isLoading}}Loading…\{{/if}}
    \{{#if (matches this.fetch FetchState.Done)}}\{{this.fetch.user}}\{{/if}}
    &lt;button disabled=\{{if (can this.fetch "retry") false true}} \{{on "click" (send this.fetch "retry")}}&gt;Retry&lt;/button&gt;
  &lt;/template&gt;
&rbrace;</code></pre>
  <ul>
    <li>Everything a template reads from a machine (<code>state</code>, <code>matches</code>, <code>can</code>, <code>status</code>, <code>actors</code>) is tracked; context is your own <code>@tracked</code> fields.</li>
    <li><code>machine(owner, instance)</code> ties the machine to the owner's lifetime: destroying the owner stops it, aborts its invokes and clears its timers.</li>
  </ul>
  <h2>On a service</h2>
  <p>A machine on a service is shared by everything that injects it, like the session in the <a href="#/persistence">persistence</a> example.</p>
  <pre><code class="language-typescript">export default class AuthService extends Service &lbrace;
  session = machine(this, new Auth())
&rbrace;</code></pre>
  <h2>In a template, with ember-resources</h2>
  <pre><code class="language-handlebars">import &lbrace; machineResource &rbrace; from '@switchyard/ember/resource'

&lt;template&gt;
  \{{#let (machineResource Fetch) as |fetch|}}…\{{/let}}
&lt;/template&gt;</code></pre>
  <h2>Decorators</h2>
  <p>
    Ember apps compile decorators with decorator-transforms (legacy semantics). Switchyard's
    decorators work in both modes; the one difference is fields: write
    <code>@is() declare isIdle: boolean</code> and <code>@region(Toggle) declare bold: Toggle</code>
    where standard decorators would use <code>accessor</code>.
  </p>
  <h2>Tests</h2>
  <p>
    <code>await settled()</code> waits for <code>@invoke</code> promises and <code>@after</code>
    timers. A long timer holds <code>settled()</code> that long: give such machines a manual clock
    with <code>useManualClock</code>. QUnit gets <code>assert.machineIn(m, State.X)</code> from
    <code>setupMachineAssertions(assert)</code>.
  </p>
</template>
