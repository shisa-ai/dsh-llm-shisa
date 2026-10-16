import { build } from 'esbuild'
import { transform } from 'lightningcss'
import { readFileSync, mkdirSync } from 'node:fs'
import { basename } from 'node:path'
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
mkdirSync('dist', { recursive: true })
await build({ entryPoints: ['src/provider/index.ts'], outfile: 'dist/provider.js', bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['@deepseek-ai/*'], sourcemap: false })
await build({ entryPoints: ['src/client/index.ts'], outfile: 'dist/client.js', bundle: true, platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic', external: ['react', 'react/*', '@deepseek-ai/*'],
 banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
 footer: { js: 'return module.exports;}});' },
 plugins: [{ name: 'plugin-css', setup(b) {
  b.onLoad({ filter: /\.module\.css$/ }, args => {
   const output = transform({ filename: basename(args.path), code: readFileSync(args.path), cssModules: true, minify: true })
   const classes = Object.fromEntries(Object.entries(output.exports).map(([key, value]) => [key, value.name]))
   return { loader: 'js', contents: `const id=${JSON.stringify(pkg.name + '/' + basename(args.path))};if(!document.querySelector('style[data-shisa-style="'+id+'"]')){const tag=document.createElement('style');tag.dataset.shisaStyle=id;tag.textContent=${JSON.stringify(output.code.toString())};document.head.appendChild(tag)}export default ${JSON.stringify(classes)}` }
  })
 } }],
})
