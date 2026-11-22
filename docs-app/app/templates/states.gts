import LightDemo from 'docs-app/components/demos/light-demo'

<template>
  <h1>States</h1>
  <p>
    States are values of a <code>State</code> enum, a subclass of real-enums' <code>Enum</code>. So
    a state has a label, can carry an icon or a CSS class, has <code>@is()</code> predicates for
    templates, and works with <code>match()</code> for exhaustive branching. The first member is
    the initial state.
  </p>
  <p>
    The <code>brand</code> line is type-only and emits nothing. TypeScript compares classes by
    shape, so without it two enums with the same members would be the same type; a private member
    makes each enum its own, and <code>m.can()</code> refuses a state of another machine. The
    <code>switchyard/state-brand</code> lint rule adds it for you.
  </p>
  <pre><code class="language-typescript">class Light extends State&lt;Crossing&gt; &lbrace;
  private declare readonly brand: never
  static Green = Light.of('green')
  static Yellow = Light.of('yellow')
  static Red = Light.of('red', &lbrace; children: Crossing &rbrace;)
  static Off = Light.of('off', &lbrace; final: true &rbrace;)

  @is() accessor isRed!: boolean // in an Ember app: @is() declare isRed: boolean
&rbrace;</code></pre>
  <h2>Nesting</h2>
  <p>
    A compound state names the enum of its children. Each level is its own enum, so each stays
    exhaustive on its own: adding a crossing state does not touch <code>Light</code>.
    <code>m.state</code> is always the top level; <code>m.matches(Crossing.Walk)</code> asks at any
    depth.
  </p>
  <p>
    The parent class names its children's enum too, <code>extends State&lt;Crossing&gt;</code>,
    so TypeScript knows every state the machine has: <code>m.matches()</code> and
    <code>m.can()</code> accept <code>Crossing.Walk</code> and reject a state of another machine.
    <code>children</code> must be the enum it names. A state with several child enums (or
    regions) names them all: <code>State&lt;Bold | Italic&gt;</code>.
  </p>
  <h2>Final states</h2>
  <p>
    Entering a final state completes its parent. A final state at the top level finishes the
    machine: its status becomes <code>done</code>, it stops its timers and actors, and further
    events are ignored.
  </p>
  <h2>History</h2>
  <p>
    <code>Step.of('details', &lbrace; children: Details, history: 'deep' &rbrace;)</code> remembers
    where you were inside <code>details</code>; a transition to <code>history(Step.Details)</code>
    resumes it (<code>shallow</code> remembers the child, <code>deep</code> every level). With
    nothing remembered yet, it enters the initial child. The wizard demo uses it for "Edit".
  </p>
  <LightDemo />
</template>
