import Component from '@glimmer/component'
import { on } from '@ember/modifier'
import { can, machine, send } from '@switchyard-ts/ember'
import { Example } from 'docs-app/components/example'
import { Search } from 'docs-app/machines/search'
import source from 'docs-app/machines/search.ts?raw'

const not = (v: boolean) => !v

export default class SearchDemo extends Component {
  search = machine(this, new Search())

  type = (e: Event) => this.search.type((e.target as HTMLInputElement).value)

  <template>
    <Example @title="Search, with a restartable task" @machine={{this.search}} @source={{source}}>
      <label>Search people <input type="search" value={{this.search.query}} {{on "input" this.type}} /></label>
      <p>State: <span class="state">{{this.search.state.label}}</span>
        · tasks performed: {{this.search.lookup.performCount}}</p>
      <ul>{{#each this.search.results as |name|}}<li>{{name}}</li>{{/each}}</ul>
      <button type="button" class="secondary" disabled={{not (can this.search "cancel")}} {{on "click" (send this.search "cancel")}}>Cancel</button>
      <p><small>Type <code>error</code> to see <code>onError</code>.</small></p>
    </Example>
  </template>
}
