import { defineConfig } from 'vite'
import { extensions, classicEmberSupport, ember } from '@embroider/vite'
import { babel } from '@rollup/plugin-babel'

export default defineConfig({
  // Served from joegaudet.com/switchyard/guide/.
  base: '/switchyard/guide/',
  plugins: [classicEmberSupport(), ember(), babel({ babelHelpers: 'runtime', extensions })],
})
