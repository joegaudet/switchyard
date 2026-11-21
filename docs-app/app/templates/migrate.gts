<template>
  <h1>Migrating</h1>
  <h2>From ember-statecharts</h2>
  <p>
    Switchyard is its spiritual successor: same idea, statecharts as the behaviour of a component,
    without the xstate v4 config underneath.
  </p>
  <ol>
    <li><strong>Generate the class.</strong> Export your machine's config to JSON and run <code>npx switchyard import machine.json --name Button</code>. You get the state enums, the event methods, getter stubs for guards and async stubs for invoked services, each marked TODO. Anything it cannot convert is listed in a comment rather than guessed.</li>
    <li><strong>Move the implementations in.</strong> Guards become getters, actions become the bodies of event methods or <code>@onEntry</code>/<code>@onExit</code> methods, services become <code>@invoke</code> methods. Context becomes <code>@tracked</code> fields: replace each <code>assign</code> with an assignment.</li>
    <li><strong>Swap the resource.</strong> <code>statechart = useMachine(this, () =&gt; (&lbrace; machine &rbrace;))</code> becomes <code>button = machine(this, new Button())</code>.</li>
    <li><strong>Update the templates.</strong> <code>this.statechart.state.matches('busy')</code> becomes <code>this.button.matches(Button.Busy)</code>, or <code>this.button.state.isBusy</code> with an <code>@is()</code> predicate. <code>this.statechart.send('SUBMIT')</code> becomes <code>this.button.submit()</code>, or <code>(send this.button "submit")</code> in a template.</li>
    <li><strong>Drop the waiters you wrote.</strong> <code>settled()</code> already waits for invokes and timers.</li>
  </ol>
  <h2>From xstate</h2>
  <p>
    The semantics are the same, so behaviour carries over; <code>toXState</code> and
    <code>fromXState</code> are tested against xstate itself. You can also keep the config:
    <code>fromXState(json, &lbrace; guards, actions, actors &rbrace;)</code> runs it on Switchyard's
    interpreter, which you then drive with <code>createInterpreter</code>.
  </p>
  <p>Event names are matched as xstate v5 does: exactly, or with <code>x.*</code> and <code>*</code>.</p>
</template>
