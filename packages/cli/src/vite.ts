// `import diagram from './fetch.ts?switchyard=svg'` (or mermaid, dot, interface, xstate, scxml;
// `&export=Name` picks a machine). Rendered at build time; the source and its imports are watched.
import { render, type DiagramFormat } from './index.js'

/** Options for the {@link switchyard} Vite plugin. */
export interface SwitchyardPluginOptions {
  /** Compile machine modules with legacy decorators, as Ember apps do. */
  legacy?: boolean
}

/**
 * A Vite (or Rollup) plugin that renders a machine module imported with a `?switchyard=<format>`
 * query, adding `&export=Name` to pick one machine, into a default-exported string at build time.
 * The module and its imports are watched.
 */
export function switchyard(options: SwitchyardPluginOptions = {}) {
  return {
    name: 'switchyard',
    /** Renders `?switchyard=` imports; any other id is left to the next plugin. */
    async load(this: { addWatchFile(file: string): void }, id: string): Promise<string | null> {
      const [file, query] = id.split('?')
      const params = new URLSearchParams(query ?? '')
      const format = params.get('switchyard') as DiagramFormat | null
      if (!file || !format) return null
      const exportName = params.get('export')
      const text = await render(file, format, {
        legacy: options.legacy ?? false,
        watch: f => this.addWatchFile(f),
        ...(exportName ? { exportName } : {}),
      })
      return `export default ${JSON.stringify(text)}`
    },
  }
}
