/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os tipos da busca no fornecedor e o estado de um ciclo (ADR-0100 §5).
 */
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { FetchPair } from '../domain/holiday-fetch.types.js'

import type { HolidayFetchStore } from './holiday-fetch.port.js'
import type { HolidayProviderClient } from './holiday-provider-client.port.js'
import type { RequestClock, RequestLimiter } from './request-limiter.js'

export type FetchTally = {
  budgetExhausted: boolean
  ceilingReached: boolean
  malformedResponses: number
  pairsFetched: number
  pairsNotCovered: number
  rateLimited: boolean
  requests: number
  unauthorized: boolean
  unexpectedFailures: number
  unreachable: number
}

export type FetchHolidayProviderDependencies = {
  /** `FERIADOS_API_MONTHLY_REQUEST_BUDGET`: o teto de requisições do mês, por instalação. */
  readonly budget: number
  readonly client: HolidayProviderClient
  readonly clock: RequestClock
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly requestCeiling?: number | undefined
  readonly spacingMilliseconds?: number | undefined
  readonly store: HolidayFetchStore
}

export type FetchHolidayProviderUseCase = {
  execute(input: {
    readonly correlationId?: string | undefined
    readonly isStopRequested: () => boolean
  }): Promise<FetchTally>
}

export type HaltReason = 'budget' | 'ceiling' | 'rate_limited' | 'stop' | 'unauthorized'

export type Cycle = {
  readonly ceiling: number
  readonly correlationId: string | undefined
  readonly dependencies: FetchHolidayProviderDependencies
  halt: HaltReason | undefined
  haltedPair: FetchPair | undefined
  readonly isStopRequested: () => boolean
  readonly limiter: RequestLimiter
  readonly now: Date
  readonly tally: FetchTally
}
