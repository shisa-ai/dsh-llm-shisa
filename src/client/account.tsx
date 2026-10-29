/** Shisa device authorization settings, using the authenticated Host Remote namespace. */
import { useEffect, useState } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import shisaRemote from '../generated/typert.remote-client.js'
import type {} from '../generated/typert.remote-client.js'
import { Button, Input, Modal, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ShisaStatus } from '../provider/types.ts'
import css from './account.module.css'

const en = { title: 'Shisa', description: 'Use Shisa models in DSH. Browser authorization uses the Jouzu client identity.', signIn: 'Sign in with Shisa', signOut: 'Sign out', cancel: 'Cancel sign-in', removeApiKey: 'Forget key', retry: 'Retry', waiting: 'Waiting for browser approval', ready: 'Connected', disconnected: 'Not connected', failed: 'Unavailable', code: 'Verification code', open: 'Open authorization page', copy: 'Copy authorization link', copied: 'Link copied', opening: 'Requesting authorization link…', manual: 'Open this link in any browser, or copy it to another browser or device. Keep this page open while approving.', credential: 'Credential', credentialDevice: 'Device link', credentialKey: 'API key', endpoint: 'Endpoint', models: 'Models', modelCount: 'models', refresh: 'Refresh', noModels: 'No models published yet', contextShort: 'context', outputShort: 'output', advanced: 'Advanced: use an API key', apiKeyHint: 'Paste a Shisa API key instead of approving a device. It is checked against the model catalog before it is stored, and never leaves this machine afterwards.', apiKeyPlaceholder: 'shsk:…', saveApiKey: 'Save key', replaceWarning: 'Saving a key replaces the current device link on this machine.', showKey: 'Show key', hideKey: 'Hide key', onboarding: 'Connect a model to get started', apiKey: 'Use a DeepSeek API key', later: 'Configure later' } as const
const zh: Record<keyof typeof en, string> = { title: 'Shisa', description: '在 DSH 中使用 Shisa 模型。浏览器授权使用 Jouzu 客户端身份。', signIn: '登录 Shisa', signOut: '退出登录', cancel: '取消登录', removeApiKey: '清除 key', retry: '重试', waiting: '等待浏览器授权', ready: '已连接', disconnected: '未连接', failed: '不可用', code: '验证码', open: '打开授权页面', copy: '复制授权链接', copied: '链接已复制', opening: '正在获取授权地址…', manual: '可在任意浏览器打开此地址，或复制到其他浏览器、设备。授权期间请保持本页打开。', credential: '凭据', credentialDevice: '设备授权', credentialKey: 'API key', endpoint: '接口地址', models: '模型', modelCount: '个模型', refresh: '刷新', noModels: '还没有发布任何模型', contextShort: '上下文', outputShort: '输出', advanced: '高级：直接使用 API key', apiKeyHint: '粘贴 Shisa API key，跳过设备授权。保存前会先用它读一次模型目录；之后 key 只留在这台机器上。', apiKeyPlaceholder: 'shsk:…', saveApiKey: '保存 key', replaceWarning: '保存 key 会取代本机当前的设备授权。', showKey: '显示', hideKey: '隐藏', onboarding: '连接模型，开始使用', apiKey: '使用 DeepSeek API key', later: '稍后配置' }
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { shisa: keyof typeof en } }
interface Actions { read: () => Promise<ShisaStatus>; signIn: () => Promise<void>; signOut: () => Promise<void>; cancel: () => Promise<void>; refresh: () => Promise<void>; setApiKey: (key: string) => Promise<void>; clearApiKey: () => Promise<void> }
type Tone = 'success' | 'danger' | 'info' | 'outline'

/** One status pill: the only place the account phase is named. */
function StatusTag({ state, t }: { state: ShisaStatus | null; t: PropsLocale<'shisa'>['t'] }) {
  const phase = state?.phase ?? 'signed-out'
  const tone: Tone = phase === 'ready' ? 'success' : phase === 'error' ? 'danger' : phase === 'waiting' ? 'info' : 'outline'
  const label = phase === 'ready' ? t('ready') : phase === 'error' ? t('failed') : phase === 'waiting' ? t('waiting') : t('disconnected')
  return <Tag tone={tone}>{label}</Tag>
}

/** The device-flow notice, including the link the user must approve. */
function DeviceWaiting({ state, t, onCancel, busy, onCopy, copied }: { state: ShisaStatus; t: PropsLocale<'shisa'>['t']; onCancel: () => void; busy: boolean; onCopy: () => void; copied: boolean }) {
  return <div className={css.waiting}>
    <div className={css.waitingHead}><StateDot state="ongoing" /><span>{state.code ? `${t('code')}: ` : t('opening')}{state.code && <code>{state.code}</code>}</span></div>
    {state.url ? <>
      <p className={css.hint}>{t('manual')}</p>
      <Input readOnly value={state.url} aria-label={t('open')} onFocus={event => event.currentTarget.select()} />
      <div className={css.actions}>
        <Button size="sm" variant="outline" onClick={onCopy}>{t(copied ? 'copied' : 'copy')}</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>{t('cancel')}</Button>
      </div>
    </> : <p className={css.hint}>{t('opening')}</p>}
  </div>
}

/** Published models, with the detail a picker needs and nothing more. */
function ModelList({ state, t }: { state: ShisaStatus; t: PropsLocale<'shisa'>['t'] }) {
  const models = state.models ?? []
  if (!models.length) return <p className={css.hint}>{t('noModels')}</p>
  return <ul className={css.modelList}>{models.map(model => <li key={model.id} className={css.modelRow}>
    <span className={css.modelName} title={model.name}>{model.name ?? model.id}</span>
    <span className={css.modelId} title={model.id}>{model.id}</span>
    <span className={css.modelLimits}>
      {model.contextWindow !== undefined && <span title={t('contextShort')}>{model.contextWindow.toLocaleString()}</span>}
      {model.maxTokens !== undefined && <span title={t('outputShort')}>{model.maxTokens.toLocaleString()}</span>}
    </span>
  </li>)}</ul>
}

function Account({ read, signIn, signOut, cancel, refresh, setApiKey, clearApiKey, t, onReady }: Actions & { onReady?: () => void } & PropsLocale<'shisa'>) {
  const [state, setState] = useState<ShisaStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [key, setKey] = useState('')
  const [reveal, setReveal] = useState(false)
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try { const next = await read(); if (!disposed) { setState(next); if (next.phase === 'waiting' || next.catalogPhase === 'loading') timer = setTimeout(() => { void poll() }, 1500) } }
      catch (cause) { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)) }
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [read, busy])
  useEffect(() => { if (state?.phase === 'ready') onReady?.() }, [state, onReady])
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await action(); setState(await read()) } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
    finally { setBusy(false) }
  }
  const byKey = state?.credential === 'api-key'
  const alert = error ?? (state?.phase === 'error' ? state.message : undefined) ?? state?.catalogError
  return <section className={css.card} aria-label={t('title')} aria-busy={busy}>
    <header className={css.header}>
      <div className={css.identity}><strong>{t('title')}</strong><span>shisa</span></div>
      <StatusTag state={state} t={t} />
    </header>

    {alert && <p className={css.alert} role="alert">{alert}</p>}

    {state?.phase === 'waiting' && <DeviceWaiting state={state} t={t} busy={busy} copied={copied}
      onCancel={() => { void run(cancel) }}
      onCopy={() => { void navigator.clipboard.writeText(state.url!).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }, () => setError(t('manual'))) }} />}

    {state?.phase === 'ready' && <div className={css.body}>
      <dl className={css.facts}>
        <div><dt>{t('credential')}</dt><dd><Tag tone="quiet">{t(byKey ? 'credentialKey' : 'credentialDevice')}</Tag></dd></div>
        {state.baseURL && <div><dt>{t('endpoint')}</dt><dd className={css.mono} title={state.baseURL}>{state.baseURL}</dd></div>}
        <div><dt>{t('models')}</dt><dd>{state.modelCount} {t('modelCount')}
          <Button size="sm" variant="ghost" disabled={busy || state.catalogPhase === 'loading'} onClick={() => { void run(refresh) }}>{t('refresh')}</Button>
        </dd></div>
      </dl>
      <ModelList state={state} t={t} />
    </div>}

    <details className={css.advanced}>
      <summary>{t('advanced')}</summary>
      <p className={css.hint}>{t('apiKeyHint')}</p>
      {state?.phase === 'ready' && !byKey && <p className={css.hint}>{t('replaceWarning')}</p>}
      <div className={css.keyRow}>
        <Input type={reveal ? 'text' : 'password'} value={key} placeholder={t('apiKeyPlaceholder')} aria-label={t('advanced')}
          autoComplete="off" spellCheck={false} onChange={event => setKey(event.currentTarget.value)} />
        <Button size="sm" variant="ghost" aria-pressed={reveal} onClick={() => setReveal(value => !value)}>{t(reveal ? 'hideKey' : 'showKey')}</Button>
      </div>
      <div className={css.actions}>
        <Button size="sm" variant="outline" disabled={busy || key.trim().length === 0}
          onClick={() => { void run(async () => { await setApiKey(key); setKey(''); setReveal(false) }) }}>{t('saveApiKey')}</Button>
      </div>
    </details>

    <footer className={css.actions}>
      {state?.phase !== 'waiting' && (state?.phase === 'ready'
        ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void run(byKey ? clearApiKey : signOut) }}>{t(byKey ? 'removeApiKey' : 'signOut')}</Button>
        : <Button size="sm" variant="primary" disabled={busy} onClick={() => { setCopied(false); void run(signIn) }}>{t('signIn')}</Button>)}
      {state?.phase === 'error' && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { void run(refresh) }}>{t('retry')}</Button>}
    </footer>
  </section>
}

/** Official single-slot onboarding, sharing the existing account Remote. */
function Onboarding({ complete, useApiKey, ...props }: Actions & PropsLocale<'shisa'> & PropsRuntime<'settings.models.sign-in'>) {
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const leave = async (next: () => void) => {
    setLeaving(true); setError(null)
    try { await props.cancel(); next() }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); setLeaving(false) }
  }
  return <Modal open closeLabel={props.t('later')} title={props.t('onboarding')} onClose={() => { if (!leaving) void leave(complete) }}>
    <Account {...props} onReady={complete} />
    {error && <p role="alert">{error}</p>}
    <div className={css.actions}>
      <Button disabled={leaving} onClick={() => { void leave(useApiKey) }}>{props.t('apiKey')}</Button>
      <Button disabled={leaving} onClick={() => { void leave(complete) }}>{props.t('later')}</Button>
    </div>
  </Modal>
}

/** Native-shell onboarding uses the same account flow and authenticated Remote. */
function DesktopOnboarding({ complete, openSection, ...props }: Actions & PropsLocale<'shisa'> & PropsRuntime<'settings.onboarding'>) {
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    let active = true
    void props.read().then(state => {
      if (!active) return
      if (state.phase === 'ready') complete()
      else setChecking(false)
    }, () => { if (active) setChecking(false) })
    return () => { active = false }
  }, [props.read, complete])
  if (checking) return null
  return <Onboarding {...props} complete={complete} useApiKey={() => {
    openSection('models')
    complete()
  }} />
}

/** Services required by the account settings page. */
export const inject = ['slots', 'locale', 'remote']

/** Mount authenticated Remote contribution and account UI.
 * @param ctx - browser plugin lifetime.
 */
export function apply(ctx: Context): void {
  ctx.remote.$mount(shisaRemote)
  ctx.effect(() => ctx.locale.register('shisa', { en, zh }))
  ctx.inject(['remote.shisa'], (scope) => {
    const read = async () => { const result = await scope.remote.shisa.getState(); if (!result.ok) throw new Error(result.error.message); return result.value }
    const actions: Actions = { read,
      refresh: async () => { const r = await scope.remote.shisa.refreshModels(); if (!r.ok) throw new Error(r.error.message) },
      signIn: async () => { const r = await scope.remote.shisa.signIn(); if (!r.ok) throw new Error(r.error.message) },
      signOut: async () => { const r = await scope.remote.shisa.signOut(); if (!r.ok) throw new Error(r.error.message) },
      cancel: async () => { const r = await scope.remote.shisa.cancel(); if (!r.ok) throw new Error(r.error.message) },
      setApiKey: async (key) => { const r = await scope.remote.shisa.setApiKey(key); if (!r.ok) throw new Error(r.error.message) },
      clearApiKey: async () => { const r = await scope.remote.shisa.clearApiKey(); if (!r.ok) throw new Error(r.error.message) },
    }
    registerAccountUi(scope, actions)
  })
}

/** Contributions share the same Remote-backed actions in every surface. */
export function registerAccountUi(scope: Context, actions: Actions): void {
    // Native shells suppress the core's automatic credential step. Contribute
    // our own step through the public onboarding slot rather than asking the
    // pre-service desktop installer to navigate an iframe that is not ready.
    // Web keeps the existing sign-in slot to avoid showing two login steps.
    if ('dshDesktop' in globalThis) {
      scope.slots.inject('settings.onboarding', () => scope.slots.register({
        name: 'settings.onboarding', id: 'shisa', order: -10, locale: 'shisa',
        inject: () => actions,
      }, DesktopOnboarding))
    }
    scope.slots.inject('settings.models.sign-in', () => scope.slots.register({ name: 'settings.models.sign-in', priority: -10, locale: 'shisa', inject: () => actions }, Onboarding))
    scope.slots.inject('settings.models.provider-card', () => scope.slots.register({ name: 'settings.models.provider-card', key: 'llm-shisa', locale: 'shisa', inject: () => actions }, Account))
}
