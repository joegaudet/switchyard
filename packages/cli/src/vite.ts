// `import diagram from './fetch.ts?switchyard=svg'` (or mermaid, dot, interface, xstate, scxml;
// `&export=Name` picks a machine). Rendered at build time; the source is watched.
import { render, type DiagramFormat } from './index.js'

export interface SwitchyardPluginOptions {
  /** Compile machine modules with legacy decorators, as Ember apps do. */
  legacy?: boolean
}

export function switchyard(options: SwitchyardPluginOptions = {}) {
  return {
    name: 'switchyard',
    async load(this: { addWatchFile(file: string): void }, id: string): Promise<string | null> {
      const [file, query] = id.split('?')
      const params = new URLSearchParams(query ?? '')
      const format = params.get('switchyard') as DiagramFormat | null
      if (!file || !format) return null
      this.addWatchFile(file)
      const exportName = params.get('export')
      const text = await render(file, format, {
        legacy: options.legacy ?? false,
        ...(exportName ? { exportName } : {}),
      })
      return `export default ${JSON.stringify(text)}`
    },
  }
}
