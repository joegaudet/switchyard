import FetchDemo from 'docs-app/components/demos/fetch-demo'

<template>
  <h1>Time and async work</h1>
  <h2>@invoke</h2>
  <p>
    Work that runs while a state is active. The method gets an <code>AbortSignal</code>; leaving
    the state aborts it, and a late result is ignored. When the promise resolves the machine takes
    <code>onDone</code>; when it rejects, <code>onError</code>.
  </p>
  <pre><code class="language-typescript">@invoke(FetchState.Loading, &lbrace; onDone: FetchState.Done, onError: FetchState.Failed &rbrace;)
async load(signal: AbortSignal) &lbrace;
  this.user = await api.get(signal)
&rbrace;</code></pre>
  <p>
    What the method returns decides the kind of actor: a promise, another <code>Machine</code> (see
    <a href="#/actors">Actors</a>), an observable, or a cleanup function for callback-style work.
  </p>
  <h2>@after</h2>
  <p>
    A transition on a timer, started when its state is entered and cancelled if it is left first.
    Machines use <code>setTimeout</code>; in tests give a class a manual clock and move time
    yourself:
  </p>
  <pre><code class="language-typescript">const clock = useManualClock(Fetch) // @switchyard/test
fetch.fetch()
clock.advance(3000) // the @after(3000) transition fires now</code></pre>
  <p>In Ember tests, <code>await settled()</code> also waits for pending invokes and timers.</p>
  <FetchDemo />
</template>
