<template>
  <h1>Testing</h1>
  <h2>Assertions and time</h2>
  <pre><code class="language-typescript">import &lbrace; matchers, useManualClock &rbrace; from '@switchyard-ts/test'

expect.extend(matchers)
const clock = useManualClock(Fetch)
const fetch = new Fetch()
fetch.fetch()
clock.advance(3000)
expect(fetch).toBeIn(Attempt.Retrying)</code></pre>
  <h2>Coverage</h2>
  <p><code>coverage(Fetch)</code> watches machines while your tests run and reports the states no test reached and the transitions no test took.</p>
  <pre><code class="language-typescript">const cov = coverage(Fetch)
cov.track(fetch)
// … the test …
console.log(String(cov.report())) // states 4/5, transitions 5/7, and which</code></pre>
  <h2>Model-based tests</h2>
  <p>
    The machine already says what the UI should do. <code>@switchyard-ts/harnessed</code> walks its
    paths and turns each into a test that drives the real UI through a
    <a href="https://joegaudet.com/harnessed/">harnessed</a> harness, checking the screen after
    every step. Add a state and the tests that reach it appear; break a button and the path through
    it fails.
  </p>
  <pre><code class="language-typescript">for (const t of modelTests(&lbrace;
  machine: () =&gt; new Fetch(),
  events: &lbrace; fetch: h =&gt; h.fetch(), retry: h =&gt; h.retry() &rbrace;,
  states: &lbrace; idle: async h =&gt; expect(await h.status()).toBe('Idle'), … &rbrace;,
&rbrace;))
  test(t.name, async () =&gt; t.run(await renderAndGetHarness()))</code></pre>
  <p><code>shortestPaths</code> and <code>simplePaths</code> give you the paths themselves, for any runner.</p>
</template>
