import Component from '@glimmer/component'
import { on } from '@ember/modifier'
import { can, machine, send } from '@switchyard-ts/ember'
import { Example } from 'docs-app/components/example'
import { Upload, Uploader } from 'docs-app/machines/uploads'
import source from 'docs-app/machines/uploads.ts?raw'

let n = 0

export default class UploadsDemo extends Component {
  uploader = machine(this, new Uploader())

  add = () => this.uploader.add(`photo-${++n}.jpg`)

  <template>
    <Example @title="An upload queue of spawned actors" @machine={{this.uploader}} @source={{source}}>
      <p>Queue: <span class="state">{{this.uploader.state.label}}</span> ·
        {{this.uploader.completed}}/{{this.uploader.files.length}} finished</p>
      <button type="button" {{on "click" this.add}}>Add a file</button>
      <ul>
        {{#each this.uploader.files as |file|}}
          <li>
            {{file.file}} <progress value={{file.progress}} max="100"></progress>
            <span class="state">{{file.state.label}}</span>
            {{#if (can file Upload.Cancelled)}}
              <button type="button" class="secondary outline" {{on "click" (send file "cancel")}}>Cancel</button>
            {{/if}}
          </li>
        {{/each}}
      </ul>
    </Example>
  </template>
}
