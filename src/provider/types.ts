/** Price as the catalog publishes it; `scope` only names whose page the number came from. */
export interface ShisaPrice {
  input?: number
  output?: number
  currency: string
  unit: string
  scope?: string
  checkedAt?: string
  url?: string
}

/** Secret-free account state sent to the initiating UI. */
export interface ShisaStatus {
  phase: 'signed-out' | 'waiting' | 'ready' | 'error'
  /** How the effective credential was supplied; absent when signed out. */
  credential?: 'device' | 'api-key'
  url?: string
  code?: string
  message?: string
  organization?: string
  catalogPhase?: 'idle' | 'loading' | 'ready' | 'error'
  catalogError?: string
  baseURL?: string
  catalogURL?: string
  catalogUpdatedAt?: number
  models?: {
    id: string
    name: string
    contextWindow?: number
    maxTokens?: number
    /** Request modalities the catalog declares for this model. */
    input?: ('text' | 'image')[]
    /** Selectable reasoning levels; absent or empty when the model does not reason. */
    reasoning?: string[]
    /** Thinking level the catalog selects by default, when it declares one. */
    reasoningDefault?: string
    /** Published per-1M-token rate, when the catalog carries one. */
    price?: ShisaPrice
  }[]
  modelCount: number
}
