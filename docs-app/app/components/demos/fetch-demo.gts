import Component from '@glimmer/component'
import { on } from '@ember/modifier'
import { can, machine, send } from '@switchyard-ts/ember'
import { Example } from 'docs-app/components/example'
import { api, Fetch, FetchState } from 'docs-app/machines/fetch'
import source from 'docs-app/machines/fetch.ts?raw'

const not = (v: boolean) => !v

export default class FetchDemo extends Component {
  fetch = machine(this, new Fetch())

  toggleFailing = () => (api.failing = !api.failing)

  <template>
    <Example @title="Fetch, with retries" @machine={{this.fetch}} @source={{source}}>
      <p>State: <span class="state">{{this.fetch.state.label}}</span>
        {{#if this.fetch.user}}· user: <strong>{{this.fetch.user}}</strong>{{/if}}
        · retries: {{this.fetch.retries}}</p>
      <button type="button" disabled={{not (can this.fetch FetchState.Loading via=this.fetch.fetch)}} {{on "click" (send this.fetch "fetch")}}>Fetch</button>
      <button type="button" disabled={{not (can this.fetch FetchState.Loading via=this.fetch.retry)}} {{on "click" (send this.fetch "retry")}}>Retry</button>
      <button type="button" class="secondary" disabled={{not (can this.fetch FetchState.Idle)}} {{on "click" (send this.fetch "reset")}}>Reset</button>
      <label><input type="checkbox" checked={{api.failing}} {{on "change" this.toggleFailing}} /> The API is down</label>
    </Example>
  </template>
}
