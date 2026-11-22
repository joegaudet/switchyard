import AuthDemo from 'docs-app/components/demos/auth-demo'

<template>
  <h1>Accessibility</h1>
  <p>
    A state change often shows on screen in a way a screen reader does not hear: a spinner
    appears, a form is replaced by a message. When a change matters to the user, say it.
  </p>
  <h2>Announce state changes</h2>
  <p>
    <code>&lt;SwitchyardAnnouncer&gt;</code> renders a visually hidden polite live region whose
    text follows the machine: the message for the deepest active state that has one. States
    without a message say nothing.
  </p>
  <pre><code class="language-handlebars">&lt;SwitchyardAnnouncer @machine=\{{this.auth.session}} @messages=\{{hash
  loggingIn="Signing in…"
  expired="Your session expired. Sign in again."
}} /&gt;</code></pre>
  <h2>Move focus on entry when the page changes</h2>
  <p>
    When a step replaces the content the user was on (a wizard step, an error screen), move focus
    to its heading from <code>@onEntry</code> or from the component that renders it, so keyboard
    and screen-reader users start where the new content starts.
  </p>
  <h2>Disable what the machine would refuse</h2>
  <p>
    <code>can</code> knows which events the current state accepts, guards included. Disabling a
    control with it tells everyone, not just sighted users, that the action is unavailable; pair
    it with text that says why.
  </p>
  <h2>Prefer <code>aria-busy</code> over a spinner alone</h2>
  <p>Mark the region that is loading with <code>aria-busy="true"</code> while an <code>@invoke</code> runs, as the demo does.</p>
  <AuthDemo />
</template>
