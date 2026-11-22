import SearchDemo from 'docs-app/components/demos/search-demo'

<template>
  <h1>With ember-concurrency</h1>
  <p>
    Switchyard doesn't need ember-concurrency: <code>@invoke</code> already runs async work for as
    long as a state is active and aborts it on exit (see
    <a href="#/async">Time and async work</a>). If your app already has tasks,
    <code>@switchyard-ts/ember-concurrency</code> lets a machine run them as they are.
  </p>
  <pre><code class="language-bash">pnpm add @switchyard-ts/ember-concurrency ember-concurrency</code></pre>
  <p>
    ember-concurrency's async-arrow tasks need its Babel transform in your app or addon:
    <code>'ember-concurrency/async-arrow-task-transform'</code> in the Babel plugins.
  </p>
  <h2>perform()</h2>
  <p>
    Return <code>perform(signal, task, ...args)</code> from an <code>@invoke</code> method. When the
    task finishes the machine takes <code>onDone</code>; when it throws, <code>onError</code>.
  </p>
  <pre><code class="language-typescript">import &lbrace; perform &rbrace; from '@switchyard-ts/ember-concurrency'

class Search extends Machine&lt;SearchState&gt; &lbrace;
  lookup = task(async (q: string) =&gt; &lbrace;
    await timeout(400)
    this.results = await api.search(q)
  &rbrace;)

  @invoke(SearchState.Searching, &lbrace; onDone: SearchState.Results, onError: SearchState.Failed &rbrace;)
  load(signal: AbortSignal) &lbrace;
    return perform(signal, this.lookup, this.query)
  &rbrace;
&rbrace;</code></pre>
  <h2>Cancellation</h2>
  <ul>
    <li>Leaving the state cancels the task instance at its next <code>await</code>. So does
      stopping the machine, or destroying the component or service that owns it.</li>
    <li>Re-entering the state (a transition with <code>reenter: true</code>) cancels the old
      instance and performs a new one. That's <code>restartable</code>, written as a transition.</li>
    <li>A task cancelled some other way while the state is still active
      (<code>cancelAll()</code>, or another caller performing a restartable task) rejects, so the
      machine takes <code>onError</code>.</li>
    <li><code>await settled()</code> waits for the task, including plain promises it awaits.</li>
  </ul>
  <h2>Task modifiers as statecharts</h2>
  <table>
    <thead><tr><th>Modifier</th><th>In a statechart</th></tr></thead>
    <tbody>
      <tr><td><code>drop</code></td><td>The busy state doesn't handle the event, so a second request is ignored.</td></tr>
      <tr><td><code>restartable</code></td><td>The event re-enters the busy state, which aborts the running work.</td></tr>
      <tr><td><code>enqueue</code>, <code>keepLatest</code></td><td>Needs a queue in context. Keep the task and its modifier, and invoke it with <code>perform()</code>.</td></tr>
    </tbody>
  </table>
  <h2>Keep the task, or move to @invoke?</h2>
  <p>
    Keep a task when other code performs it, when it uses <code>enqueue</code> or
    <code>keepLatest</code>, or when templates read <code>isRunning</code> and
    <code>last.value</code>. Move it into an <code>async</code> <code>@invoke</code> method when
    the machine is its only caller: the state already says whether it is running.
  </p>
  <SearchDemo />
</template>
