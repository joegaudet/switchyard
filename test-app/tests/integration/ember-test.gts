import { module, test } from 'qunit'
import { setupRenderingTest } from 'ember-qunit'
import { click, render, settled } from '@ember/test-helpers'
import Component from '@glimmer/component'
import type Owner from '@ember/owner'
import Service, { service } from '@ember/service'
import { tracked } from '@glimmer/tracking'
import { on } from '@ember/modifier'
import { can, machine, matches, send } from '@switchyard-ts/ember'
import { machineResource } from '@switchyard-ts/ember/resource'
import { Fetch, FetchState, Session, Timer } from 'test-app/machines'

let lastFetch: Fetch | undefined

class FetchView extends Component {
  fetch = machine(this, new Fetch())

  constructor(owner: Owner, args: object) {
    super(owner, args)
    lastFetch = this.fetch
  }

  <template>
    <p data-test-state>{{this.fetch.state.label}}</p>
    {{#if (matches this.fetch FetchState.Done)}}<p data-test-data>{{this.fetch.data}}</p>{{/if}}
    <button
      type="button"
      data-test-fetch
      disabled={{if (can this.fetch "fetch") false true}}
      {{on "click" (send this.fetch "fetch")}}
    >Fetch</button>
  </template>
}

class TimerView extends Component {
  timer = machine(this, new Timer())

  <template>
    <p data-test-state>{{this.timer.state.label}}</p>
    <button type="button" data-test-fetch {{on "click" (send this.timer "fetch")}}>Go</button>
  </template>
}

class Toggle {
  @tracked show = true
}

class AuthService extends Service {
  session = machine(this, new Session())
}

class Greeting extends Component {
  @service declare auth: AuthService

  <template>
    <p data-test-greeting>{{if this.auth.session.user this.auth.session.user "nobody"}}</p>
  </template>
}

class LoginButton extends Component {
  @service declare auth: AuthService

  <template>
    <button type="button" data-test-login {{on "click" (send this.auth.session "login" "ada")}}>
      Log in
    </button>
  </template>
}

module('@switchyard-ts/ember', function (hooks) {
  setupRenderingTest(hooks)

  test('templates re-render on transitions, and settled() waits for @invoke', async function (assert) {
    await render(<template><FetchView /></template>)
    assert.dom('[data-test-state]').hasText('Idle')
    assert.dom('[data-test-fetch]').isNotDisabled()

    await click('[data-test-fetch]')

    assert.dom('[data-test-state]').hasText('Done')
    assert.dom('[data-test-data]').hasText('loaded')
    assert.dom('[data-test-fetch]').isDisabled()
  })

  test('settled() waits for @after timers', async function (assert) {
    await render(<template><TimerView /></template>)
    await click('[data-test-fetch]')
    assert.dom('[data-test-state]').hasText('Timedout')
  })

  test('destroying the owner stops the machine', async function (assert) {
    const toggle = new Toggle()
    await render(<template>{{#if toggle.show}}<FetchView />{{/if}}</template>)
    assert.strictEqual(lastFetch?.status, 'active')
    toggle.show = false
    await settled()
    assert.strictEqual(lastFetch?.status, 'stopped')
  })

  test('machineResource ties a machine to a template block', async function (assert) {
    await render(<template>
      {{#let (machineResource Fetch) as |m|}}
        <p data-test-state>{{m.state.label}}</p>
        <button type="button" data-test-fetch {{on "click" (send m "fetch")}}>Fetch</button>
      {{/let}}
    </template>)
    assert.dom('[data-test-state]').hasText('Idle')
    await click('[data-test-fetch]')
    assert.dom('[data-test-state]').hasText('Done')
  })

  test('a machine on a service is shared by every component that injects it', async function (assert) {
    this.owner.register('service:auth', AuthService)
    await render(<template><Greeting /><LoginButton /></template>)
    assert.dom('[data-test-greeting]').hasText('nobody')
    await click('[data-test-login]')
    assert.dom('[data-test-greeting]').hasText('ada')
  })
})
