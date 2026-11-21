import { transform } from 'esbuild'
import { defineConfig } from 'vitest/config'

// Vite 8 leaves TC39 decorators and `accessor` in place, and Node cannot parse them, so files
// that use decorators are lowered with esbuild first. `*.legacy.*` files compile with legacy
// (experimentalDecorators) semantics instead, the way Ember apps compile them.
export default defineConfig({
  plugins: [
    {
      name: 'lower-decorators',
      enforce: 'pre',
      async transform(code, id) {
        if (!/\.ts$/.test(id) || !/^\s*@\w/m.test(code)) return null
        const legacy = id.includes('.legacy.')
        const out = await transform(code, {
          loader: 'ts',
          target: 'es2022',
          sourcefile: id,
          sourcemap: true,
          tsconfigRaw: {
            compilerOptions: { experimentalDecorators: legacy, useDefineForClassFields: !legacy },
          },
        })
        return { code: out.code, map: out.map }
      },
    },
  ],
})
