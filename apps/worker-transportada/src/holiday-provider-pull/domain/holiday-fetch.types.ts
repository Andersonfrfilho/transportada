/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  HolidayProviderFetchStatus,
  HolidayProviderScope,
} from './holiday-provider.constant.js'

/** Um par que a rotina busca: `(escopo, código, ano)`. `attempts` são as falhas seguidas até agora. */
export type FetchPair = {
  readonly attempts: number
  readonly ibgeCode: string
  readonly scope: HolidayProviderScope
  readonly year: number
}

/** A linha de `holiday_provider_fetches` que o desfecho de uma tentativa grava. */
export type FetchRecord = {
  readonly attempts: number
  readonly errorCode: string | null
  readonly fetchedAt: Date | null
  readonly nextAttemptAt: Date
  readonly pair: FetchPair
  readonly status: HolidayProviderFetchStatus
}
