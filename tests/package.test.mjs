import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, existsSync } from 'node:fs'
import vm from 'node:vm'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
test('one profile bundle installs the provider and client contribution', () => {
 assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
 assert.match(readFileSync('cordis.patch.yml', 'utf8'), /@sabishii-me\/dsh-model-provider-shisa/)
 assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes'))
 for (const path of Object.values(pkg.exports)) assert.ok(existsSync(path), path)
})
test('browser artifact registers its standalone package identity', () => {
 const entries = []
 vm.runInNewContext(readFileSync('dist/client.js', 'utf8'), { window: { __ModuleLoader__: { load: entry => entries.push(entry) } } })
 assert.equal(entries.length, 1)
 assert.equal(entries[0].id, pkg.name)
 assert.equal(typeof entries[0].factory, 'function')
})
test('runtime package has no workspace dependencies or installer hooks', () => {
 for (const group of ['dependencies', 'peerDependencies']) for (const range of Object.values(pkg[group] ?? {})) assert.ok(!range.startsWith('workspace:'))
 assert.equal(pkg.scripts.postinstall, undefined)
 assert.equal(pkg.dependencies.jouzu, undefined)
})
