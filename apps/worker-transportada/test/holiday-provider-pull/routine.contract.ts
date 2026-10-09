/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ApplyHolidayProviderUseCase,
  ApplyTally,
} from '../../src/holiday-provider-pull/application/apply-holiday-provider.use-case.js'
import type {
  DiscoverHolidayCitiesUseCase,
  DiscoveryTally,
} from '../../src/holiday-provider-pull/application/discover-holiday-cities.use-case.js'
import type {
  FetchHolidayProviderUseCase,
  FetchTally,
} from '../../src/holiday-provider-pull/application/fetch-holiday-provider.use-case.js'
import { createHolidayProviderPullRoutine } from '../../src/holiday-provider-pull/application/holiday-provider-pull.routine.js'
import { HOLIDAY_PROVIDER_PULL_JOB } from '../../src/holiday-provider-pull/domain/holiday-provider-pull.constant.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { isJobOutcome } from '../../src/shared/job-catalog.constant.js'

const EMPTY_DISCOVERY: DiscoveryTally = {
  batches: 0,
  companies: 0,
  discardedCityCodes: 0,
  documentsRead: 0,
  documentsWithoutDestination: 0,
  failedCompanies: 0,
}
const EMPTY_FETCH: FetchTally = {
  allNotFound: false,
  budgetExhausted: false,
  ceilingReached: false,
  circuitOpened: false,
  entriesDiscarded: 0,
  malformedResponses: 0,
  pairsFetched: 0,
  pairsNotCovered: 0,
  planRestricted: 0,
  rateLimited: false,
  requests: 0,
  unauthorized: false,
  unexpectedFailures: 0,
  unreachable: 0,
}
const EMPTY_APPLY: ApplyTally = {
  companies: 0,
  failedCompanies: 0,
  municipalInserted: 0,
  nationalMismatch: 0,
  stateInserted: 0,
  unexpectedFailures: 0,
}

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'holiday-provider-pull-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: HOLIDAY_PROVIDER_PULL_JOB,
    origin: 'schedule',
  }
}

type Overrides = {
  readonly apply?: Partial<ApplyTally> | Error
  readonly discovery?: Partial<DiscoveryTally> | Error
  readonly fetch?: Partial<FetchTally> | Error
}

function build(overrides: Overrides = {}) {
  const order: string[] = []
  const logged: unknown[][] = []
  const record = (...args: unknown[]) => {
    logged.push(args)
  }
  const stage = <TTally extends object>(
    name: string,
    empty: TTally,
    override?: Partial<TTally> | Error,
  ) => ({
    execute: async () => {
      order.push(name)
      if (override instanceof Error) throw override
      return { ...empty, ...override }
    },
  })
  const routine = createHolidayProviderPullRoutine({
    apply: stage('apply', EMPTY_APPLY, overrides.apply) as ApplyHolidayProviderUseCase,
    discover: stage(
      'discover',
      EMPTY_DISCOVERY,
      overrides.discovery,
    ) as DiscoverHolidayCitiesUseCase,
    fetch: stage('fetch', EMPTY_FETCH, overrides.fetch) as FetchHolidayProviderUseCase,
    logger: { debug: record, error: record, info: record, warn: record } as never,
  })
  return { logged, order, routine }
}

describe('a rotina `holiday.provider.pull` (spec 252 T3.5)', () => {
  test('o nome é o que o catálogo e o CHECK do banco conhecem', () => {
    expect(HOLIDAY_PROVIDER_PULL_JOB).toBe('holiday.provider.pull')
  })

  test('descobre, busca e aplica, nessa ordem, e fecha em `succeeded` quando nada falhou', async () => {
    const { order, routine } = build({
      apply: { municipalInserted: 4, nationalMismatch: 2, stateInserted: 1 },
      discovery: { batches: 3, discardedCityCodes: 4, documentsRead: 120 },
      fetch: { pairsFetched: 6, requests: 8 },
    })

    const result = await routine.run(buildContext())

    expect(order).toEqual(['discover', 'fetch', 'apply'])
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({
      discovery_batches: 3,
      discovery_discarded_city_codes: 4,
      discovery_documents: 120,
      municipal_inserted: 4,
      national_mismatch: 2,
      pairs_fetched: 6,
      requests: 8,
      state_inserted: 1,
    })
    for (const value of Object.values(result.counters)) expect(typeof value).toBe('number')
  })

  test('orçamento do mês e teto do ciclo não são falha: o ciclo fecha em `succeeded`', async () => {
    const { routine } = build({ fetch: { budgetExhausted: true, ceilingReached: true } })

    const result = await routine.run(buildContext())

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ budget_exhausted: 1, ceiling_reached: 1 })
  })

  test('a parada pedida é lida entre as etapas e a rotina larga o que ainda não começou', async () => {
    let stage = 0
    const { order, routine } = build()

    await routine.run(
      buildContext(() => {
        stage += 1
        return stage > 1
      }),
    )

    expect(order).toEqual(['discover'])
  })

  test('cada falha do fornecedor fecha com a palavra do catálogo, na precedência certa', async () => {
    const cases: ReadonlyArray<readonly [Partial<FetchTally>, string]> = [
      [{ unreachable: 2 }, 'provider_unreachable'],
      [{ rateLimited: true }, 'provider_unreachable'],
      [{ malformedResponses: 1, unreachable: 3 }, 'malformed_response'],
      [{ malformedResponses: 1, unauthorized: true, unreachable: 3 }, 'provider_unauthorized'],
    ]

    for (const [fetch, expected] of cases) {
      const { routine } = build({ fetch })

      const result = await routine.run(buildContext())

      expect(result.outcome).toBe(expected as never)
      expect(isJobOutcome({ job: HOLIDAY_PROVIDER_PULL_JOB, outcome: result.outcome })).toBeTrue()
    }
  })

  test('um ciclo em que todo pedido deu 404 fecha em `malformed_response`, não em `succeeded`', async () => {
    const { routine } = build({ fetch: { allNotFound: true, pairsNotCovered: 4, requests: 4 } })

    const result = await routine.run(buildContext())

    expect(result.outcome).toBe('malformed_response')
  })

  test('plano restrito: sem nenhum par buscado fecha em `provider_unauthorized`; com algum, é só contador', async () => {
    const nothingWorked = build({ fetch: { pairsFetched: 0, planRestricted: 3, requests: 3 } })
    const someWorked = build({ fetch: { pairsFetched: 2, planRestricted: 1, requests: 3 } })

    const bad = await nothingWorked.routine.run(buildContext())
    const fine = await someWorked.routine.run(buildContext())

    expect(bad.outcome).toBe('provider_unauthorized')
    expect(fine.outcome).toBe('succeeded')
    expect(fine.counters).toMatchObject({ plan_restricted: 1 })
  })

  test('o disjuntor aberto e as datas descartadas aparecem nos contadores', async () => {
    const { routine } = build({
      fetch: { circuitOpened: true, entriesDiscarded: 7, requests: 3, unreachable: 3 },
    })

    const result = await routine.run(buildContext())

    expect(result.outcome).toBe('provider_unreachable')
    expect(result.counters).toMatchObject({ circuit_opened: 1, entries_discarded: 7 })
  })

  test('falha nossa vence a do fornecedor e fecha em `unexpected_error`', async () => {
    const cases: Overrides[] = [
      { discovery: { failedCompanies: 1 } },
      { fetch: { unauthorized: true, unexpectedFailures: 1 } },
      { apply: { failedCompanies: 1 } },
      { apply: { unexpectedFailures: 1 } },
    ]

    for (const overrides of cases) {
      const { routine } = build(overrides)

      const result = await routine.run(buildContext())

      expect(result.outcome).toBe('unexpected_error')
    }
  })

  test('uma etapa que estoura não impede as seguintes, que só tocam o banco, e fecha em `unexpected_error`', async () => {
    const boom = new Error('connection reset 11222333000181')
    for (const overrides of [
      { discovery: boom },
      { fetch: boom },
      { apply: boom },
    ] as Overrides[]) {
      const { logged, order, routine } = build(overrides)

      const result = await routine.run(buildContext())

      expect(order).toEqual(['discover', 'fetch', 'apply'])
      expect(result.outcome).toBe('unexpected_error')
      expect(JSON.stringify(logged)).not.toContain('11222333000181')
    }
  })

  test('o log do ciclo leva só contadores e identificadores', async () => {
    const { logged, routine } = build({ fetch: { requests: 5 } })

    await routine.run(buildContext())

    const finished = logged.find((entry) => entry[0] === 'holiday_provider_pull_cycle_finished')
    expect(finished).toBeDefined()
    const metadata = finished?.[1] as Record<string, unknown>
    expect(metadata).toMatchObject({
      correlationId: 'holiday-provider-pull-contract',
      executionId: 'execution-1',
      outcome: 'succeeded',
      requests: 5,
    })
  })
})
