/** dsh-navbar 双 half 构建：Node（空 apply）+ 官方 client bundle（自渲染 DOM）。 */

export default [
  {
    entry: ['src/index.mjs'],
    format: 'esm',
    platform: 'node',
    target: 'es2024',
    outDir: 'lib',
    clean: true,
  },
  {
    entry: ['src/client/index.ts'],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    outDir: 'lib',
    external: [/@deepseek-ai\/dsh-client-/],
    banner: 'window.__ModuleLoader__.load({ id: "@dsh-external/dsh-navbar", factory: (require) => {',
    footer: 'return module.exports; } });',
  },
]
