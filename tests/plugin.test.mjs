import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { TYPERT } from '../src/generated/typert.host.js'
import { TYPERT_REMOTE } from '../src/generated/typert.remote-client.js'
import { baseUrlFromCatalogUrl, SHISA_CREDENTIAL } from '../dist/provider.js'

const hostMethods = () => Object.fromEntries(TYPERT.invocations.map(entry => [entry.method, entry]))
const remoteMethods = () => Object.fromEntries(TYPERT_REMOTE.descriptors.map(entry => [entry.method, entry]))

test('host and browser descriptors expose the same methods', () => {
  assert.deepEqual(Object.keys(hostMethods()).sort(), Object.keys(remoteMethods()).sort())
  for (const method of ['setApiKey', 'clearApiKey']) {
    assert.ok(hostMethods()[method], `host descriptor for ${method}`)
    assert.ok(remoteMethods()[method], `remote descriptor for ${method}`)
  }
  assert.equal(hostMethods().setApiKey.service, 'shisaProvider')
  assert.equal(hostMethods().setApiKey.namespace, 'shisa')
  assert.deepEqual(hostMethods().setApiKey.parameters.map(parameter => parameter.name), ['key'])
  // The loader rejects a manifest whose parameters omit the wire name.
  for (const method of Object.keys(hostMethods())) {
    for (const parameter of hostMethods()[method].parameters) assert.ok(typeof parameter.wire === 'string' && parameter.wire.length > 0, `${method}/${parameter.name} wire`)
  }
})

test('status schema accepts both credential sources and nothing else', () => {
  const create = hostMethods().getState.result.create()
  for (const credential of ['device', 'api-key']) assert.equal(create.parse({ phase: 'ready', modelCount: 1, credential }).credential, credential)
  assert.equal(create.parse({ phase: 'signed-out', modelCount: 0 }).credential, undefined)
  assert.throws(() => create.parse({ phase: 'ready', modelCount: 0, credential: 'environment' }))
})

test('an API-key catalog implies its gateway base', () => {
  assert.equal(baseUrlFromCatalogUrl('https://api.shisa.ai/v1/jouzu/model-catalog'), 'https://api.shisa.ai/v1')
  assert.equal(baseUrlFromCatalogUrl('https://gateway.example.test/model-catalog'), 'https://gateway.example.test')
  assert.equal(baseUrlFromCatalogUrl('https://gateway.example.test/custom'), 'https://gateway.example.test/v1')
  for (const unsafe of ['http://api.shisa.ai/v1/jouzu/model-catalog', 'https://user:pass@api.shisa.ai/v1/jouzu/model-catalog', 'https://api.shisa.ai/v1/jouzu/model-catalog?x=1']) {
    assert.throws(() => baseUrlFromCatalogUrl(unsafe), unsafe)
  }
})

test('the API key never reaches a credential record owned by the flow', () => {
  assert.equal(String(SHISA_CREDENTIAL), 'shisa-provider/account')
  const source = readFileSync(new URL('../src/provider/index.ts', import.meta.url), 'utf8')
  // The key is stored only under the reference the adapter resolves, never as the
  // flow-owned grant record whose shape carries a link token.
  assert.match(source, /credentials\.set\(API_KEY, apiKey\)/)
  assert.doesNotMatch(source, /credentials\.set\(SHISA_CREDENTIAL/)
})
