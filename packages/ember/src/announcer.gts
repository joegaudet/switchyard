// <SwitchyardAnnouncer @machine={{m}} @messages={{hash loading="Loading…"}} />: a visually
// hidden live region whose text is the message for the deepest active state that has one, so
// screen readers hear state changes the screen shows some other way.
import type { TOC } from '@ember/component/template-only'
import { htmlSafe } from '@ember/template'
import type { Machine } from '@switchyard/core'

/** The message for the deepest active state path (`loading.retrying`, then `loading`) that has one. */
export function announcement(machine: Machine<unknown>, messages: Record<string, string>): string {
  for (const leaf of machine.snapshot().configuration) {
    const parts = leaf.split('.')
    for (let i = parts.length; i > 0; i--) {
      const text = messages[parts.slice(0, i).join('.')]
      if (text !== undefined) return text
    }
  }
  return ''
}

// A constant, not user input: safe to mark so Ember binds it without a warning.
const hidden = htmlSafe(
  'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0',
)

export const SwitchyardAnnouncer: TOC<{
  Element: HTMLDivElement
  Args: { machine: Machine<unknown>; messages: Record<string, string> }
}> = <template>
  <div role="status" aria-live="polite" style={{hidden}} ...attributes>{{announcement @machine @messages}}</div>
</template>
