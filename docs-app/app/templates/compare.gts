<template>
  <h1>Compared</h1>
  <p>
    The same machine, a submit button that is idle, busy while it saves, then shows success or an
    error, three ways. All three run statecharts with the same semantics; they differ in where the
    machine lives and how Ember sees it.
  </p>
  <h2>Switchyard</h2>
  <pre><code class="language-typescript">class Button extends State &lbrace;
  private declare readonly brand: never
  static Idle = Button.of('idle')
  static Busy = Button.of('busy')
  static Success = Button.of('success')
  static Error = Button.of('error')
&rbrace;

class Submit extends Machine&lt;Button&gt; &lbrace;
  constructor(private save: () =&gt; Promise&lt;void&gt;) &lbrace; super() &rbrace;

  @transition(&lbrace; from: [Button.Idle, Button.Success, Button.Error], to: Button.Busy &rbrace;)
  submit() &lbrace;&rbrace;

  @invoke(Button.Busy, &lbrace; onDone: Button.Success, onError: Button.Error &rbrace;)
  run() &lbrace; return this.save() &rbrace;
&rbrace;

// in a component
button = machine(this, new Submit(() =&gt; this.args.onSubmit()))</code></pre>
  <h2>xstate v5</h2>
  <pre><code class="language-typescript">const submitMachine = setup(&lbrace;
  actors: &lbrace; save: fromPromise(async (&lbrace; input &rbrace;) =&gt; input.save()) &rbrace;,
&rbrace;).createMachine(&lbrace;
  initial: 'idle',
  states: &lbrace;
    idle: &lbrace; on: &lbrace; SUBMIT: 'busy' &rbrace; &rbrace;,
    busy: &lbrace; invoke: &lbrace; src: 'save', input: (&lbrace; context &rbrace;) =&gt; context, onDone: 'success', onError: 'error' &rbrace; &rbrace;,
    success: &lbrace; on: &lbrace; SUBMIT: 'busy' &rbrace; &rbrace;,
    error: &lbrace; on: &lbrace; SUBMIT: 'busy' &rbrace; &rbrace;,
  &rbrace;,
&rbrace;)
// in Ember: create an actor, subscribe, copy its snapshot into tracked state, stop it on destroy</code></pre>
  <h2>ember-statecharts</h2>
  <pre><code class="language-typescript">statechart = useMachine(this, () =&gt; (&lbrace;
  machine: buttonMachine.withConfig(&lbrace; services: &lbrace; onSubmit: this.args.onSubmit &rbrace; &rbrace;),
&rbrace;))
// buttonMachine: an xstate v4 createMachine config like the one above</code></pre>
  <p>
    Using ember-concurrency for async work? A machine can run your existing tasks; see
    <a href="#/ember-concurrency">With ember-concurrency</a>.
  </p>
  <h2>Side by side</h2>
  <table class="matrix">
    <thead><tr><th></th><th>Switchyard</th><th>xstate v5</th><th>ember-statecharts</th></tr></thead>
    <tbody>
      <tr><td>Machine is written as</td><td>a class with decorators</td><td>a config object</td><td>an xstate v4 config object</td></tr>
      <tr><td>States are</td><td>real-enums values</td><td>strings</td><td>strings</td></tr>
      <tr><td>Events are</td><td>typed methods</td><td><code>send(&lbrace; type &rbrace;)</code></td><td><code>send('TYPE')</code></td></tr>
      <tr><td>Context is</td><td><code>@tracked</code> fields</td><td>immutable, via <code>assign</code></td><td>immutable, via <code>assign</code></td></tr>
      <tr><td>Hierarchy, parallel, history, guards, delays</td><td>✓</td><td>✓</td><td>✓ (xstate v4)</td></tr>
      <tr><td>Invoked and spawned actors, system, emit</td><td>✓</td><td>✓</td><td>xstate v4's subset</td></tr>
      <tr><td>Templates track it</td><td>✓, directly</td><td>by hand</td><td>✓, through a resource</td></tr>
      <tr><td>Stops with its owner</td><td>✓ <code>machine(this, …)</code></td><td>by hand</td><td>✓</td></tr>
      <tr><td>Test waiters for timers and invokes</td><td>✓</td><td>by hand</td><td>—</td></tr>
      <tr><td>Diagrams from code</td><td>✓ Mermaid, DOT, SVG, live</td><td>Stately Studio</td><td>via xstate</td></tr>
      <tr><td>Stately Inspector</td><td>✓ <code>connectInspector</code></td><td>✓</td><td>—</td></tr>
      <tr><td>Model-based testing</td><td>✓ on harnessed</td><td><code>@xstate/graph</code></td><td>—</td></tr>
      <tr><td>Last release (Nov 2026)</td><td>0.x</td><td>5.x, active</td><td>0.16.1, Feb 2023</td></tr>
    </tbody>
  </table>
  <p>
    If your team already thinks in xstate configs, or shares machines with a React codebase, xstate
    is the better fit; Switchyard exports to and imports from it. If your machines live in an Ember
    app and you would rather they read like the rest of your classes, that is what Switchyard is for.
  </p>
</template>
