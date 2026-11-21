import Component from '@glimmer/component'
import { on } from '@ember/modifier'
import { service } from '@ember/service'
import { matches, send, SwitchyardAnnouncer } from '@switchyard/ember'
import { Example } from 'docs-app/components/example'
import { Session } from 'docs-app/machines/auth'
import source from 'docs-app/machines/auth.ts?raw'
import type AuthService from 'docs-app/services/auth'

const announcements = {
  loggingIn: 'Signing in…',
  loggedIn: 'Signed in',
  expired: 'Your session expired. Sign in again.',
  loggedOut: 'Signed out',
}

export default class AuthDemo extends Component {
  @service declare auth: AuthService

  <template>
    <Example @title="A session on a service, saved across reloads" @machine={{this.auth.session}} @source={{source}}>
      <SwitchyardAnnouncer @machine={{this.auth.session}} @messages={{announcements}} />
      <p>Session: <span class="state">{{this.auth.session.state.label}}</span>
        {{#if this.auth.session.user}}· {{this.auth.session.user}}{{/if}}</p>
      {{#if (matches this.auth.session Session.LoggedIn)}}
        <button type="button" class="secondary" {{on "click" (send this.auth.session "logOut")}}>Sign out</button>
        <p><small>Expires after 8 seconds. Reload the page: the session comes back.</small></p>
      {{else if (matches this.auth.session Session.LoggingIn)}}
        <p aria-busy="true">Signing in…</p>
      {{else}}
        <button type="button" {{on "click" (send this.auth.session "logIn" "ada@example.com")}}>Sign in as Ada</button>
      {{/if}}
    </Example>
  </template>
}
