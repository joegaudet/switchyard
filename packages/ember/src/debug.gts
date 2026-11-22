// <SwitchyardDebug @machine={{this.fetch}} />: the machine's live statechart, for development.
// Its own entrypoint, so ELK (via @switchyard/graph) loads only where it is used.
import type { TOC } from '@ember/component/template-only'
import { modifier } from 'ember-modifier'
import type { Machine } from '@switchyard/core'
import { defineDiagramElement, type SwitchyardDiagram } from '@switchyard/graph/viewer'

defineDiagramElement()

const follow = modifier((element: SwitchyardDiagram, [machine]: [Machine<unknown>]) => {
  element.machine = machine
})

export const SwitchyardDebug: TOC<{
  Element: HTMLElement
  Args: { machine: Machine<unknown> }
}> = <template>
  <switchyard-diagram class="switchyard-debug" {{follow @machine}} ...attributes />
</template>
