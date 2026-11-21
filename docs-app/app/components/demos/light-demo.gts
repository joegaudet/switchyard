import Component from '@glimmer/component'
import { on } from '@ember/modifier'
import { machine, matches, send } from '@switchyard/ember'
import { Example } from 'docs-app/components/example'
import { Crossing, Light, TrafficLight } from 'docs-app/machines/light'
import source from 'docs-app/machines/light.ts?raw'

export default class LightDemo extends Component {
  light = machine(this, new TrafficLight())

  <template>
    <Example @title="A traffic light with a crossing" @machine={{this.light}} @source={{source}}>
      <p>Light: <span class="state">{{this.light.state.label}}</span>
        {{#if (matches this.light Light.Red)}}
          · crossing: <span class="state">{{if (matches this.light Crossing.Walk) "Walk" "Wait"}}</span>
        {{/if}}</p>
      <button type="button" class="secondary" {{on "click" (send this.light "powerCut")}}>Power cut</button>
      {{#if (matches this.light Light.Off)}}<p><small>Off is a final state: the machine is done, and stops.</small></p>{{/if}}
    </Example>
  </template>
}
