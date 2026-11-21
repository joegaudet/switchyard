import Component from '@glimmer/component'
import { on } from '@ember/modifier'
import { htmlSafe } from '@ember/template'
import { machine, send } from '@switchyard/ember'
import { Example } from 'docs-app/components/example'
import { Formatting, Toggle } from 'docs-app/machines/editor'
import source from 'docs-app/machines/editor.ts?raw'

export default class EditorDemo extends Component {
  format = machine(this, new Formatting())

  // Toggle.On is a state of both bold and italic, so ask each region, not matches().
  get bold() {
    return this.format.bold === Toggle.On
  }

  get italic() {
    return this.format.italic === Toggle.On
  }

  get style() {
    const s = this.format.state
    return htmlSafe(`font-weight:${s.bold === Toggle.On ? 700 : 400};font-style:${s.italic === Toggle.On ? 'italic' : 'normal'};text-align:${s.align.value}`)
  }

  <template>
    <Example @title="Three regions, one machine" @machine={{this.format}} @source={{source}}>
      <button type="button" aria-pressed={{if this.bold "true" "false"}} {{on "click" (send this.format "toggleBold")}}>Bold</button>
      <button type="button" aria-pressed={{if this.italic "true" "false"}} {{on "click" (send this.format "toggleItalic")}}>Italic</button>
      <button type="button" class="secondary" {{on "click" (send this.format "alignLeft")}}>Left</button>
      <button type="button" class="secondary" {{on "click" (send this.format "alignCenter")}}>Center</button>
      <button type="button" class="secondary" {{on "click" (send this.format "alignRight")}}>Right</button>
      <p style={{this.style}}>The quick brown fox jumps over the lazy dog.</p>
      <p><small>bold <span class="state">{{this.format.bold.value}}</span> ·
        italic <span class="state">{{this.format.italic.value}}</span> ·
        align <span class="state">{{this.format.align.value}}</span></small></p>
    </Example>
  </template>
}
