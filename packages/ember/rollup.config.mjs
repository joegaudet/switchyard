import { babel } from '@rollup/plugin-babel'
import { Addon } from '@embroider/addon-dev/rollup'

const addon = new Addon({ srcDir: 'src', destDir: 'dist' })

/** @type {import('rollup').RollupOptions} */
export default {
  output: addon.output(),
  plugins: [
    addon.publicEntrypoints(['index.js', 'resource.js']),
    addon.dependencies(),
    babel({ extensions: ['.js', '.gjs', '.ts', '.gts'], babelHelpers: 'bundled' }),
    addon.declarations(
      'declarations',
      'ember-tsc --declaration --emitDeclarationOnly --noEmit false',
    ),
    addon.clean(),
  ],
}
