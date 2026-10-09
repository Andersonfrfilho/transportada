/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os tipos da busca no fornecedor e o estado de um ciclo (ADR-0100 §5).
 */
import type { WorkerLogger } from '../../shared/worker.types.js'

import type { HolidayFetchStore } from './holiday-fetch.port.js'
import type { HolidayProviderClient } from './holiday-provider-client.port.js'
import type { RequestClock, RequestLimiter } from './request-limiter.js'

export type FetchTally = {
  /** Todo pedido do ciclo deu 404: o caminho mudou, não são cidades sem cobertura. */
  allNotFound: boolean
  budgetExhausted: boolean
  ceilingReached: boolean
  circuitOpened: boolean
  entriesDiscarded: number
  malformedResponses: number
  notFoundResponses: number
  pairsFetched: number
  pairsNotCovered: number
  planRestricted: number
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

export type HaltReason =
  | 'budget'
  | 'ceiling'
  | 'circuit'
  | 'contract'
  | 'rate_limited'
  | 'stop'
  | 'unauthorized'

export type Cycle = {
  readonly ceiling: number
  consecutiveUnreachable: number
  readonly correlationId: string | undefined
  readonly dependencies: FetchHolidayProviderDependencies
  halt: HaltReason | undefined
  readonly isStopRequested: () => boolean
  readonly limiter: RequestLimiter
  readonly now: Date
  readonly tally: FetchTally
}
