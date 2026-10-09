/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T3.3: o relógio, o fornecedor e o banco falsos dos contratos da busca. O relógio é
 * monotônico e o `sleep` o adianta (nenhum teste espera de verdade); o banco é só o suficiente para
 * provar o fluxo — o SQL de verdade é provado contra o Postgres em `holiday-fetch.integration.ts`.
 */
import type {
  HolidayFetchStore,
  SaveFetchSuccessParams,
} from '../../src/holiday-provider-pull/application/holiday-fetch.port.js'
import type {
  HolidayProviderClient,
  HolidayProviderPage,
} from '../../src/holiday-provider-pull/application/holiday-provider-client.port.js'
import type {
  FetchPair,
  FetchRecord,
} from '../../src/holiday-provider-pull/domain/holiday-fetch.types.js'
import type { HolidayProviderRequest } from '../../src/holiday-provider-pull/domain/holiday-provider.types.js'

export type FakeClock = {
  /** Faz o tempo passar sem ser um `sleep` do limitador (a chamada de rede que demorou). */
  readonly advance: (milliseconds: number) => void
  readonly clock: {
    readonly nowMilliseconds: () => number
    readonly sleep: (milliseconds: number) => Promise<void>
  }
  readonly sleeps: number[]
}

export function buildFakeClock(): FakeClock {
  let milliseconds = 1_000_000
  const sleeps: number[] = []

  return {
    advance: (elapsed) => {
      milliseconds += elapsed
    },
    clock: {
      nowMilliseconds: () => milliseconds,
      sleep: async (waited) => {
        sleeps.push(waited)
        milliseconds += waited
      },
    },
    sleeps,
  }
}

export type RecordedRequest = HolidayProviderRequest & { readonly atMilliseconds: number }

export function buildScriptedClient(input: {
  readonly clock: FakeClock['clock']
  readonly events?: string[]
  readonly respond: (request: HolidayProviderRequest) => HolidayProviderPage
}): HolidayProviderClient & { readonly requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = []

  return {
    async fetchPage(request) {
      requests.push({ ...request, atMilliseconds: input.clock.nowMilliseconds() })
      input.events?.push(
        `request:${request.scope}:${request.ibgeCode}:${request.year}:${request.page}`,
      )
      return input.respond(request)
    },
    requests,
  }
}

export function pairKey(pair: Pick<FetchPair, 'ibgeCode' | 'scope' | 'year'>): string {
  return `${pair.scope}:${pair.ibgeCode}:${pair.year}`
}

export type InMemoryFetchStore = HolidayFetchStore & {
  readonly budgetGrants: () => number
  readonly events: string[]
  readonly records: Map<string, FetchRecord>
  readonly saved: SaveFetchSuccessParams[]
}

/** `demand`: as cidades com a demanda já somada, em qualquer ordem. */
export function buildInMemoryFetchStore(input: {
  readonly budgetAlreadyUsed?: number
  readonly demand: ReadonlyArray<{ readonly ibgeCode: string; readonly total: number }>
  readonly events?: string[]
}): InMemoryFetchStore {
  const events = input.events ?? []
  const records = new Map<string, FetchRecord>()
  const saved: SaveFetchSuccessParams[] = []
  let used = input.budgetAlreadyUsed ?? 0
  let grants = 0

  const isDue = (key: string, now: Date) => {
    const record = records.get(key)
    return record === undefined || record.nextAttemptAt.getTime() <= now.getTime()
  }

  return {
    async claimBudget({ budget }) {
      events.push('claim')
      if (used >= budget) return false
      used += 1
      grants += 1
      return true
    },
    budgetGrants: () => grants,
    async ensureStatePair({ now, stateCode, year }) {
      events.push(`ensure-state:${stateCode}:${year}`)
      const pair: FetchPair = { attempts: 0, ibgeCode: stateCode, scope: 'state', year }
      return isDue(pairKey(pair), now)
        ? { ...pair, attempts: records.get(pairKey(pair))?.attempts ?? 0 }
        : undefined
    },
    events,
    async listDuePairs({ limit, now, years }) {
      const national =
        input.demand.length === 0
          ? []
          : years.map((year) => ({ attempts: 0, ibgeCode: 'BR', scope: 'national' as const, year }))
      const cities = [...input.demand]
        .toSorted(
          (left, right) => right.total - left.total || left.ibgeCode.localeCompare(right.ibgeCode),
        )
        .flatMap((city) =>
          years.map((year) => ({
            attempts: 0,
            ibgeCode: city.ibgeCode,
            scope: 'city' as const,
            year,
          })),
        )
      return [...national, ...cities]
        .filter((pair) => isDue(pairKey(pair), now))
        .map((pair) => ({ ...pair, attempts: records.get(pairKey(pair))?.attempts ?? 0 }))
        .slice(0, limit)
    },
    async recordFetches(batch) {
      for (const record of batch) {
        events.push(`record:${record.status}:${pairKey(record.pair)}`)
        records.set(pairKey(record.pair), record)
      }
    },
    records,
    async saveSuccess(params) {
      events.push(`save:${pairKey(params.pair)}`)
      saved.push(params)
      records.set(pairKey(params.pair), {
        attempts: 0,
        errorCode: null,
        fetchedAt: params.now,
        nextAttemptAt: params.nextAttemptAt,
        pair: params.pair,
        status: 'done',
      })
      if (params.stateCovered !== undefined) {
        const statePair: FetchPair = {
          attempts: 0,
          ibgeCode: params.stateCovered.stateCode,
          scope: 'state',
          year: params.stateCovered.year,
        }
        records.set(pairKey(statePair), {
          attempts: 0,
          errorCode: null,
          fetchedAt: params.now,
          nextAttemptAt: params.nextAttemptAt,
          pair: statePair,
          status: 'done',
        })
      }
    },
    saved,
  }
}
