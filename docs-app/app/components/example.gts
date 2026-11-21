// A live example: the demo, the source it runs (imported ?raw, so it cannot drift), and the
// machine's live statechart.
import type { TOC } from '@ember/component/template-only'
import type { Machine } from '@switchyard/core'
import { SwitchyardDebug } from '@switchyard/ember/debug'

export const Example: TOC<{
  Args: { title: string; machine: Machine<unknown>; source: string }
  Blocks: { default: [] }
}> = <template>
  <article class="example">
    <header><strong>{{@title}}</strong> <small>live</small></header>
    <div class="example-body">
      <div class="example-demo">{{yield}}</div>
      <SwitchyardDebug @machine={{@machine}} class="example-chart" />
    </div>
    <details>
      <summary>Source</summary>
      <pre><code class="language-typescript">{{@source}}</code></pre>
    </details>
  </article>
</template>
