/** Independent Shisa authorization owner. Does not import or modify Jouzu. */
import { hostname } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { Volatile } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-settings'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { createModelGeneration, type ModelGeneration } from './models.ts'
import { catalogModels, catalogSchema } from './catalog.ts'
import type { AdapterRegistrationHandle } from '@deepseek-ai/dsh-llm'
import type { PiAiModelProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import type { ShisaStatus } from './types.ts'
import { credentialKey, credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-authorization'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { z as json } from 'zod'
import { authorizeShisa, grantSchema, readBoundedJson } from './device-flow.ts'

/** Deployment policy for the Shisa device service. */
export interface Config {
  gateway: Volatile<string>
  /** Catalog read by an API-key-only account; also names the inference base. */
  apiKeyCatalogUrl: Volatile<string>
  clientVersion: string
  requestTimeoutMs: number
  maxResponseBytes: number
}
/** Credential address owned exclusively by this plugin. */
export const SHISA_CREDENTIAL = credentialKey('llm-shisa', 'account')
/** Reference the pi-ai adapter resolves per request, whatever supplied it. */
const API_KEY = credentialRef('SHISA_API_KEY')
const INSTALL_ID = credentialKey('llm-shisa', 'installation')
/** Storage identities used before the package was renamed; adopted on first start. */
const LEGACY_CREDENTIAL = credentialKey('shisa-provider', 'account')
const LEGACY_INSTALL = credentialKey('shisa-provider', 'installation')
/** Jouzu's product catalog for plain key accounts, whose gateway base is derived from it. */
const DEFAULT_API_KEY_CATALOG = 'https://api.shisa.ai/v1/jouzu/model-catalog'
/** Printable ASCII, no whitespace: keys travel as a bearer value, never a path. */
const API_KEY_PATTERN = /^[\x21-\x7e]{16,8192}$/

/** Derive the OpenAI-compatible base URL an API-key catalog implies.
 * @param catalogUrl - product catalog address.
 * @returns HTTPS base URL without a trailing slash.
 */
export function baseUrlFromCatalogUrl(catalogUrl: string): string {
  const url = new URL(catalogUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Shisa API catalog must be an HTTPS URL without credentials, query or fragment')
  if (url.pathname.endsWith('/jouzu/model-catalog')) url.pathname = url.pathname.slice(0, -'/jouzu/model-catalog'.length)
  else if (url.pathname.endsWith('/model-catalog')) url.pathname = url.pathname.slice(0, -'/model-catalog'.length)
  else url.pathname = '/v1'
  return url.href.replace(/\/+$/, '')
}

/** Registers the real Shisa device flow through DSH's authorization service. */
export default class ShisaProvider extends TypertRemoteService {
  static inject = ['authorization', 'credentials', 'llm', 'typert']
  static Config = z.object({
    gateway: z.string().default('https://gateway.shisa.ai').volatile(),
    apiKeyCatalogUrl: z.string().default(DEFAULT_API_KEY_CATALOG).volatile(),
    clientVersion: z.string().default('dsh/0.2.1'),
    requestTimeoutMs: z.natural().min(1).max(2_147_483_647).default(30000),
    maxResponseBytes: z.natural().min(1).default(1048576),
  })
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'shisaProvider', { namespace: 'shisa' })
    this.runtime = { ctx }
    ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
    const gateway = new URL(config.gateway.get())
    if (gateway.protocol !== 'https:' || gateway.username || gateway.password || gateway.search || gateway.hash) throw new Error('Shisa gateway must be an HTTPS URL without credentials, query or fragment')
    // Fail at composition time rather than at the first key sign-in.
    baseUrlFromCatalogUrl(config.apiKeyCatalogUrl.get())
    ctx.llm.registerConfigurableProviders([{ provider: 'shisa', displayName: 'Shisa', settingsNs: ctx.fiber.entry?.options.id ?? 'llm-shisa', settingsPath: [] }])
    this.initialization = this.restoreAccount()
    ctx.effect(() => () => { this.lifetime.abort(); return Promise.allSettled([this.initialization, ...(this.active ? [this.active] : []), ...(this.catalogTask ? [this.catalogTask] : [])]) })
    ctx.effect(() => ctx.authorization.registerFlow({
      key: SHISA_CREDENTIAL, label: 'Shisa', methods: [{ id: 'device', label: 'Sign in with Shisa' }],
      run: async (session) => {
        const identity = await ctx.credentials.modifyRecord(INSTALL_ID, current => Promise.resolve(current ?? { kind: 'grant', payload: { id: randomUUID() } }))
        if (identity?.kind !== 'grant' || !identity.payload || typeof identity.payload !== 'object' || !('id' in identity.payload) || typeof identity.payload.id !== 'string') throw new Error('Stored Shisa installation identity is invalid')
        const result = await authorizeShisa({ ...config, gateway: config.gateway.get(), installId: identity.payload.id, deviceName: hostname(), platform: `${process.platform}-${process.arch}`,
          signal: session.signal,
          notify: ({ url, code }) => session.notify({ message: 'Authorize this device on Shisa to continue.', url, code }),
          commit: async (grant) => {
            await session.commit({ kind: 'grant', payload: { ...grant, gateway: gateway.href } })
            this.status = { phase: 'ready', credential: 'device', modelCount: 0, catalogPhase: 'idle' }
          },
        })
        if (!result.acknowledged) this.runtime.ctx.logger.warn('Shisa credentials saved; receipt acknowledgement pending')
      },
    }))
  }
  private readonly runtime: { ctx: Context }
  private retiredModels: ModelGeneration[] = []
  private models: ModelGeneration | undefined
  private registration: AdapterRegistrationHandle | undefined
  private status: ShisaStatus = { phase: 'signed-out', modelCount: 0 }
  private readonly lifetime = new AbortController()
  private catalogTask: Promise<void> | undefined
  private active: Promise<void> | undefined
  private initialization: Promise<void> = Promise.resolve()

  /** Read account status without exposing credentials.
   * @returns current authorization and catalog status.
   */
  @Remote
  async getState(): Promise<ShisaStatus> {
    await this.initialization
    return { ...this.status }
  }

  /** Start one real device authorization; the caller polls secret-free status.
   * @returns once the attempt is admitted.
   */
  @Remote
  async signIn(): Promise<void> {
    await this.initialization
    if (this.active) throw new Error('Shisa sign-in already running')
    // An API-key account may be replaced by a device sign-in; a device account
    // must be signed out first so two credentials never race for one key.
    if (this.status.phase === 'ready' && this.status.credential !== 'api-key') throw new Error('Already signed in')
    this.status = { phase: 'waiting', modelCount: 0 }
    const started = Date.now()
    this.runtime.ctx.logger.info('Shisa authorization started; per-request timeout=%d ms', this.config.requestTimeoutMs)
    const task = this.runtime.ctx.authorization.begin({ key: SHISA_CREDENTIAL, signal: this.lifetime.signal,
      interaction: { notify: (notice) => { this.runtime.ctx.logger.info('Shisa device code issued after %d ms; waiting for approval', Date.now() - started); this.status = { phase: 'waiting', modelCount: 0, ...notice } }, prompt: async () => { throw new Error('Unexpected Shisa prompt') } },
    }).then(async (result) => {
      if (result.status === 'authorized') { this.runtime.ctx.logger.info('Shisa authorization committed after %d ms', Date.now() - started); this.status = { phase: 'ready', credential: 'device', modelCount: 0, catalogPhase: 'idle' }; this.startCatalog() }
      else this.status = { phase: 'signed-out', modelCount: 0 }
    }).catch((error: unknown) => { this.runtime.ctx.logger.warn('Shisa sign-in failed after %d ms (%s)', Date.now() - started, error instanceof Error ? error.name : 'unknown'); this.status = { phase: 'error', modelCount: 0, message: error instanceof Error ? error.message : 'Shisa sign-in failed' } })
      .finally(() => { this.active = undefined })
    this.active = task
  }

  /** Cancel the active device authorization.
   * @returns after its work has settled.
   */
  @Remote
  async cancel(): Promise<void> { this.runtime.ctx.authorization.cancel(SHISA_CREDENTIAL); await this.active }

  /** Validate and store an API key, replacing the device sign-in it supersedes.
   * @param key - Shisa API key; read back from the catalog before it is persisted.
   * @returns after the catalog is published as the new model generation.
   */
  @Remote
  async setApiKey(key: string): Promise<void> {
    await this.initialization
    if (this.active) throw new Error('Shisa sign-in already running')
    const candidate = key.trim()
    if (!API_KEY_PATTERN.test(candidate)) throw new Error('That does not look like a Shisa API key (16–8192 printable characters, no spaces)')
    const catalogUrl = this.config.apiKeyCatalogUrl.get()
    const baseURL = baseUrlFromCatalogUrl(catalogUrl)
    this.status = { ...this.status, catalogPhase: 'loading', catalogError: '' }
    try {
      // Probe before persisting: a rejected key must never displace a working one.
      const catalog = await this.fetchCatalog(catalogUrl, candidate)
      const { models, defaults } = catalogModels(catalog)
      if (!models.length) throw new Error('Shisa returned no available models')
      await this.publish(baseURL, models, defaults, candidate)
      // One effective credential: a stale device grant would win on next start.
      await this.runtime.ctx.credentials.deleteRecord(SHISA_CREDENTIAL).catch((error: unknown) => {
        this.runtime.ctx.logger.warn('Shisa API key saved but the previous device link could not be removed (%s)', error instanceof Error ? error.message : 'unknown')
      })
      this.status = { phase: 'ready', credential: 'api-key', catalogPhase: 'ready', modelCount: models.length, baseURL, catalogURL: catalogUrl, catalogUpdatedAt: Date.now(),
        models: models.map(model => ({ ...model, name: model.name ?? model.id })) }
    } catch (error) {
      this.status = { ...this.status, catalogPhase: 'error', catalogError: error instanceof Error ? error.message : 'Shisa API key was rejected' }
      throw error
    }
  }

  /** Forget the stored API key and every model it published.
   * @returns after the adapter registration is withdrawn.
   */
  @Remote
  async clearApiKey(): Promise<void> {
    await this.cancel()
    await this.catalogTask
    await this.runtime.ctx.credentials.unset(API_KEY)
    await this.disposeModels()
    this.status = { phase: 'signed-out', modelCount: 0 }
  }

  /** Revoke the saved Shisa device before deleting its credential.
   * @returns after server revocation and local credential removal.
   */
  @Remote
  async signOut(): Promise<void> {
    await this.cancel()
    await this.catalogTask
    const record = await this.runtime.ctx.credentials.readRecord(SHISA_CREDENTIAL)
    if (record?.kind === 'grant') {
      const grant = grantSchema.parse(record.payload)
      const response = await fetch(this.config.gateway.get().replace(/\/+$/, '') + '/device/link/revoke', {
        method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${grant.link_token}` },
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.requestTimeoutMs)]),
      })
      await response.body?.cancel()
      if (response.status !== 204) throw new Error(`Shisa revocation failed (HTTP ${response.status}); credential retained`)
      await this.runtime.ctx.credentials.deleteRecord(SHISA_CREDENTIAL)
    }
    await this.runtime.ctx.credentials.unset(API_KEY)
    await this.disposeModels()
    this.status = { phase: 'signed-out', modelCount: 0 }
  }

  /** Adopt credentials saved under the pre-rename key so a rename does not sign users out.
   * Best effort: a failed move leaves the new key empty and the legacy record untouched.
   */
  private async adoptLegacyCredentials(): Promise<void> {
    const credentials = this.runtime.ctx.credentials
    const adopt = async (from: typeof SHISA_CREDENTIAL, to: typeof SHISA_CREDENTIAL, subject: string): Promise<void> => {
      if (await credentials.readRecord(to)) return
      const legacy = await credentials.readRecord(from)
      if (!legacy) return
      await credentials.modifyRecord(to, async () => legacy)
      await credentials.deleteRecord(from)
      this.runtime.ctx.logger.info('Shisa %s migrated from its pre-rename credential key', subject)
    }
    try {
      await adopt(LEGACY_CREDENTIAL, SHISA_CREDENTIAL, 'account')
      await adopt(LEGACY_INSTALL, INSTALL_ID, 'installation identity')
    } catch (error) {
      this.runtime.ctx.logger.warn('Shisa credential migration skipped (%s)', error instanceof Error ? error.message : 'unknown')
    }
  }

  private async restoreAccount(): Promise<void> {
    try {
      await this.adoptLegacyCredentials()
      const record = await this.runtime.ctx.credentials.readRecord(SHISA_CREDENTIAL)
      if (record?.kind === 'grant') {
        const grant = grantSchema.parse(record.payload)
        void grant
        this.status = { phase: 'ready', credential: 'device', modelCount: 0, catalogPhase: 'idle' }
        this.startCatalog()
      } else if ((await this.runtime.ctx.credentials.resolve(API_KEY))?.value?.trim()) {
        // A key may outlive the device link, and a key-only account never had one.
        this.status = { phase: 'ready', credential: 'api-key', modelCount: 0, catalogPhase: 'idle' }
        this.startCatalog()
      }
    } catch (error) { this.status = { phase: 'error', modelCount: 0, message: error instanceof Error ? error.message : 'Shisa account unavailable' } }
    this.runtime.ctx.logger.info('Shisa provider ready; account %s', this.status.phase)
  }

  /** Retry model discovery without reauthorizing the signed-in account. */
  @Remote
  async refreshModels(): Promise<void> {
    await this.initialization
    if (this.status.phase !== 'ready') throw new Error('Sign in before loading models')
    this.startCatalog()
  }

  private startCatalog(): void {
    if (this.catalogTask) return
    this.status = { ...this.status, catalogPhase: 'loading', catalogError: '' }
    this.catalogTask = this.loadCatalog().then(() => {
      this.status = { ...this.status, catalogPhase: 'ready' }
    }, () => {
      this.status = { ...this.status, catalogPhase: 'error', catalogError: 'Model loading failed. Retry without signing in again.' }
    }).finally(() => { this.catalogTask = undefined })
  }

  /** Resolve the credential that is effective now and the endpoints it implies.
   * @returns catalog and inference addresses with the bearer to send.
   */
  private async catalogSource(): Promise<{ catalogUrl: string; baseURL: string; apiKey: string; credential: 'device' | 'api-key' }> {
    const record = await this.runtime.ctx.credentials.readRecord(SHISA_CREDENTIAL)
    if (record?.kind === 'grant') {
      const grant = grantSchema.parse(record.payload)
      if (!grant.endpoints) throw new Error('Stored Shisa sign-in has no endpoints; sign in again')
      const endpoints = json.object({ openai_base_url: json.string().url(), model_catalog_url: json.string().url() }).parse(grant.endpoints)
      for (const address of Object.values(endpoints)) {
        const url = new URL(address)
        if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Unsafe model endpoint')
      }
      return { catalogUrl: endpoints.model_catalog_url, baseURL: endpoints.openai_base_url, apiKey: grant.api_key.secret, credential: 'device' }
    }
    const apiKey = (await this.runtime.ctx.credentials.resolve(API_KEY))?.value?.trim()
    if (!apiKey) throw new Error('Sign in to Shisa or add an API key first')
    const catalogUrl = this.config.apiKeyCatalogUrl.get()
    return { catalogUrl, baseURL: baseUrlFromCatalogUrl(catalogUrl), apiKey, credential: 'api-key' }
  }

  /** Read one catalog with a bearer; never echoes the response body in errors.
   * @param catalogUrl - HTTPS catalog address.
   * @param apiKey - bearer value for this read.
   * @returns the validated catalog document.
   */
  private async fetchCatalog(catalogUrl: string, apiKey: string): Promise<json.infer<typeof catalogSchema>> {
    const response = await fetch(catalogUrl, {
      redirect: 'error',
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/vnd.jouzu.model-catalog+json; version=1, application/json' },
      signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.requestTimeoutMs)]),
    })
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 401 || response.status === 403) throw new Error('Shisa rejected this API key')
      throw new Error(`Shisa catalog unavailable (HTTP ${response.status})`)
    }
    const parsed = catalogSchema.safeParse(await readBoundedJson(response, this.config.maxResponseBytes))
    if (!parsed.success) throw new Error('Shisa returned an unsupported model catalog')
    return parsed.data
  }

  private async loadCatalog(): Promise<void> {
    const source = await this.catalogSource()
    const { models, defaults } = catalogModels(await this.fetchCatalog(source.catalogUrl, source.apiKey))
    if (!models.length) throw new Error('Shisa returned no available models')
    await this.publish(source.baseURL, models, defaults, source.apiKey)
    this.status = { ...this.status, credential: source.credential, modelCount: models.length, models: models.map(model => ({ ...model, name: model.name ?? model.id })), baseURL: source.baseURL, catalogURL: source.catalogUrl, catalogUpdatedAt: Date.now() }
  }

  /** Publish one immutable catalog generation through the official pi-ai adapter.
   * @param baseURL - gateway base this catalog implies.
   * @param models - projected pi-ai model profiles.
   * @param defaults - per-model thinking defaults.
   * @param apiKey - value the adapter resolves through `SHISA_API_KEY`.
   */
  private async publish(baseURL: string, models: PiAiModelProfile[], defaults: Map<string, string>, apiKey: string): Promise<void> {
    const previous = await this.runtime.ctx.credentials.resolve(API_KEY)
    if (previous?.value !== apiKey) await this.runtime.ctx.credentials.set(API_KEY, apiKey)
    const generation = await createModelGeneration(this.runtime.ctx, { displayName: 'Shisa', api: 'openai-completions', apiKeyEnv: 'SHISA_API_KEY', baseURL, models }, defaults)
    const previousModel = this.models
    this.registration?.()
    try {
      this.registration = this.runtime.ctx.llm.registerAdapter(['shisa'], generation.adapter)
      this.models = generation
      if (previousModel) this.retiredModels.push(previousModel)
    } catch (error) {
      if (previousModel) this.registration = this.runtime.ctx.llm.registerAdapter(['shisa'], previousModel.adapter)
      await generation.dispose()
      throw error
    }
  }

  /** Withdraw the adapter and settle every retired generation. */
  private async disposeModels(): Promise<void> {
    this.registration?.()
    this.registration = undefined
    await this.models?.dispose()
    await Promise.all(this.retiredModels.map(model => model.dispose()))
    this.retiredModels = []
    this.models = undefined
  }

}

declare module '@deepseek-ai/cordis' {
  interface Context { shisaProvider: ShisaProvider }
}
