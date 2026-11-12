import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { TYPERT } from '../src/generated/typert.host.js'
import { TYPERT_REMOTE } from '../src/generated/typert.remote-client.js'
import { baseUrlFromCatalogUrl, catalogModels, SHISA_CREDENTIAL } from '../dist/provider.js'

const hostMethods = () => Object.fromEntries(TYPERT.invocations.map(entry => [entry.method, entry]))
const remoteMethods = () => Object.fromEntries(TYPERT_REMOTE.descriptors.map(entry => [entry.method, entry]))

test('host and browser descriptors expose the same methods', () => {
  assert.deepEqual(Object.keys(hostMethods()).sort(), Object.keys(remoteMethods()).sort())
  assert.ok(hostMethods().setApiKey, 'host descriptor for setApiKey')
  assert.ok(remoteMethods().setApiKey, 'remote descriptor for setApiKey')
  // Signing out is the only way out of an account; a separate forget-key path
  // silently fell back to the device link and looked like a no-op.
  assert.equal(hostMethods().clearApiKey, undefined)
  assert.equal(hostMethods().setApiKey.service, 'shisaProvider')
  assert.equal(hostMethods().setApiKey.namespace, 'shisa')
  assert.deepEqual(hostMethods().setApiKey.parameters.map(parameter => parameter.name), ['key'])
  // Hand-carried descriptors drift; keep their provenance honest.
  for (const method of Object.keys(hostMethods())) {
    assert.equal(hostMethods()[method].sourceLocation.file, 'src/provider/index.ts', `${method} source file`)
    assert.ok(Number.isInteger(hostMethods()[method].sourceLocation.line), `${method} source line`)
  }
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

test('the model row carries the capabilities the table renders', () => {
  const create = hostMethods().getState.result.create()
  const row = { id: 'qwen3.7-max', name: 'Qwen 3.7 Max', contextWindow: 1_000_000, maxTokens: 131_072, input: ['text', 'image'], reasoning: ['low', 'high'], reasoningDefault: 'high', price: { input: 1.65, output: 4.96, currency: 'USD', unit: 'per_1m_tokens', scope: 'shisa-published', checkedAt: '2026-10-28', url: 'https://platform.shisa.ai/en/#pricing' } }
  const parsed = create.parse({ phase: 'ready', modelCount: 1, models: [row] })
  assert.deepEqual(parsed.models, [row])
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
  assert.equal(String(SHISA_CREDENTIAL), 'llm-shisa/account')
  // The rename keeps the old key readable so an upgrade does not sign anyone out.
  const source = readFileSync(new URL('../src/provider/index.ts', import.meta.url), 'utf8')
  assert.match(source, /credentialKey\('shisa-provider', 'account'\)/)
  // The key is stored only under the reference the adapter resolves, never as the
  // flow-owned grant record whose shape carries a link token.
  assert.match(source, /credentials\.set\(API_KEY, apiKey\)/)
  assert.doesNotMatch(source, /credentials\.set\(SHISA_CREDENTIAL/)
})

test('a stored key is the credential whether or not a device link exists', () => {
  const source = readFileSync(new URL('../src/provider/index.ts', import.meta.url), 'utf8')
  assert.match(source, /const apiKey = stored \|\| grant\?\.api_key\.secret/)
})

test('catalog entries that declare no capability are not published', () => {
  const catalog = {
    modelOfferings: [
      { modelId: 'works', capabilities: ['reasoning', 'tool_calling'], compatibilityProfileIds: [], routeIds: [] },
      { modelId: 'rejects-tools', compatibilityProfileIds: [], routeIds: [] },
      { modelId: 'offline', capabilities: ['reasoning'], availability: { status: 'unavailable' }, compatibilityProfileIds: [], routeIds: [] },
    ],
    routes: [],
    compatibilityProfiles: [],
  }
  const { models, skipped } = catalogModels(catalog)
  assert.deepEqual(models.map(model => model.id), ['works'])
  // DSH always sends tool definitions, and these backends answer 400.
  assert.deepEqual(skipped, ['rejects-tools'])
})
