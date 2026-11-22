import AuthDemo from 'docs-app/components/demos/auth-demo'

<template>
  <h1>Persistence</h1>
  <p>
    <code>m.snapshot()</code> is plain JSON: the active states, what each history state
    remembers, and the context fields you list in <code>static persist</code>.
    <code>m.restore(snapshot)</code> puts a machine back in that state without running entry or
    exit actions, then restarts the timers and invokes of the states it restored.
  </p>
  <pre><code class="language-typescript">class Auth extends Machine&lt;Session&gt; &lbrace;
  static persist = ['user']
  …
&rbrace;

localStorage.setItem('auth', JSON.stringify(auth.snapshot()))
const result = Auth.schema()['~standard'].validate(JSON.parse(saved)) // Standard Schema
if ('value' in result) auth.restore(result.value)</code></pre>
  <p>
    <code>Machine.schema()</code> is a <a href="https://standardschema.dev">Standard Schema</a>: a
    snapshot from an older version of the machine is rejected, not half-restored.
  </p>
  <h2>Into a record or the URL</h2>
  <p>
    <code>bindField(machine, record, 'status')</code> keeps a machine's state in a record attribute
    (WarpDrive, ember-data, anything): it starts from the attribute and writes each transition
    back. With <code>&lbrace; mode: 'accessor' &rbrace;</code> it turns a controller property into a
    view of the machine, which is how a state becomes a query param.
  </p>
  <AuthDemo />
</template>
