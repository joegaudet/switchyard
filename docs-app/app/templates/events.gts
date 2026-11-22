import FetchDemo from 'docs-app/components/demos/fetch-demo'

<template>
  <h1>Events and guards</h1>
  <p>
    A method decorated with <code>@transition</code> is an event. Calling it sends the event; the
    method's body runs as the transition's action, with the arguments you passed.
  </p>
  <pre><code class="language-typescript">@transition(&lbrace; from: FetchState.Failed, to: history(FetchState.Loading), guard: 'hasRetriesLeft' &rbrace;)
@transition(&lbrace; from: FetchState.Done, to: FetchState.Idle &rbrace;) // a second source for the same event
retry() &lbrace;
  this.retries++
&rbrace;</code></pre>
  <ul>
    <li><strong>No <code>from</code></strong>: every state handles the event. <strong>No <code>to</code></strong>: the body runs, nothing exits or enters.</li>
    <li><strong>Stacked decorators</strong> give one event several sources. When two could apply, the one written first wins.</li>
    <li><strong>Guards</strong> name a getter (or field, or method) of the class, so they read your tracked context. Combine them with <code>and()</code>, <code>or()</code> and <code>not()</code>. A name that is not on the class throws when the machine starts, and the ESLint plugin catches it sooner.</li>
    <li><strong><code>event</code></strong> names the event when the method name cannot be it: one of the machine's own (<code>stop</code>, <code>send</code>, <code>state</code>), or not an identifier. <code>@transition(&lbrace; event: 'stop', … &rbrace;) onStop() &lbrace;&rbrace;</code>; calling <code>onStop()</code> sends <code>stop</code>.</li>
    <li><strong><code>m.can.retry</code></strong> asks whether the event would be taken now, guards included. Templates use it to disable buttons.</li>
  </ul>
  <h2>One event at a time</h2>
  <p>
    Events run to completion. An event method called from inside an action is queued and runs
    after the current event, never in the middle of it. Event bodies are synchronous: if one
    returns a promise you get a warning, because async work belongs in <a href="#/async">@invoke</a>.
  </p>
  <h2>Unhandled events</h2>
  <p>
    Sending an event the current state does not handle does nothing, with a warning in
    development. Set <code>static strict = true</code> on a machine to make it throw instead.
    <code>m.send('retry')</code> is the untyped way to send.
  </p>
  <FetchDemo />
</template>
