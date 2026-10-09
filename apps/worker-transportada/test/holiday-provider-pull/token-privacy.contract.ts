/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * CA9: o token não aparece em nenhuma linha de log, inclusive em erro. A rotina inteira roda com o
 * **cliente HTTP de verdade** (o `fetch` é o dublê) e o fornecedor ecoa o token de todo jeito que
 * consegue: na mensagem da rede, no corpo de um 500, no corpo de um 401, em resposta fora do formato e em
 * nome de feriado. Contador, desfecho e log são serializados e procurados.
 */
import { describe, expect, test } from 'bun:test'

import { createApplyHolidayProviderUseCase } from '../../src/holiday-provider-pull/application/apply-holiday-provider.use-case.js'
import { createDiscoverHolidayCitiesUseCase } from '../../src/holiday-provider-pull/application/discover-holiday-cities.use-case.js'
import { createFetchHolidayProviderUseCase } from '../../src/holiday-provider-pull/application/fetch-holiday-provider.use-case.js'
import { createHolidayProviderPullRoutine } from '../../src/holiday-provider-pull/application/holiday-provider-pull.routine.js'
import { createFeriadosApiClient } from '../../src/holiday-provider-pull/infrastructure/feriados-api.client.js'
import { buildFakeClock, buildInMemoryFetchStore } from '../fixtures/holiday-fetch.fixture.js'
import { FERIADOS_API_FIXTURE_TOKEN, jsonResponse } from '../fixtures/feriados-api.fixture.js'

const TOKEN = FERIADOS_API_FIXTURE_TOKEN

const ECHOES: ReadonlyArray<readonly [string, () => Promise<Response>]> = [
  ['mensagem da rede', () => Promise.reject(new TypeError(`connect failed Bearer ${TOKEN}`))],
  ['corpo de um 500', async () => new Response(`Bearer ${TOKEN} rejected`, { status: 500 })],
  ['corpo de um 401', async () => jsonResponse({ echo: TOKEN }, { status: 401 })],
  [
    'corpo de um 429',
    async () => jsonResponse({ echo: TOKEN }, { headers: { 'retry-after': '30' }, status: 429 }),
  ],
  ['corpo que não é JSON', async () => new Response(`not json ${TOKEN}`, { status: 200 })],
  [
    'nome de feriado',
    async () => jsonResponse([{ data: '99/99/2026', nome: TOKEN, tipo: 'MUNICIPAL' }]),
  ],
]

async function runWithEcho(
  echo: () => Promise<Response>,
  options: { readonly storeFailsWith?: Error } = {},
) {
  const logged: unknown[][] = []
  const record = (...args: unknown[]) => {
    logged.push(args)
  }
  const logger = { debug: record, error: record, info: record, warn: record } as never
  const { clock } = buildFakeClock()
  const store = buildInMemoryFetchStore({ demand: [{ ibgeCode: '3509502', total: 10 }] })
  if (options.storeFailsWith !== undefined) {
    const failure = options.storeFailsWith
    store.listDuePairs = async () => {
      throw failure
    }
  }
  const client = createFeriadosApiClient({
    baseUrl: 'https://feriadosapi.test',
    fetch: async () => echo(),
    timeoutInMilliseconds: 1000,
    token: TOKEN,
  })
  const routine = createHolidayProviderPullRoutine({
    apply: createApplyHolidayProviderUseCase({
      logger,
      now: () => new Date('2026-10-09T12:00:00.000Z'),
      store: {
        applyCompany: async () => ({ municipalInserted: 0, stateInserted: 0 }),
        listCompanies: async () => [],
        readNationalDates: async () => new Map(),
      },
    }),
    discover: createDiscoverHolidayCitiesUseCase({
      logger,
      now: () => new Date('2026-10-09T12:00:00.000Z'),
      store: {
        listCompanies: async () => [],
        readDestinations: async () => [],
        readDocumentBatch: async () => [],
        saveBatch: async () => undefined,
      },
    }),
    fetch: createFetchHolidayProviderUseCase({
      budget: 100,
      client,
      clock,
      logger,
      now: () => new Date('2026-10-09T12:00:00.000Z'),
      store,
    }),
    logger,
  })

  const result = await routine.run({
    correlationId: 'token-privacy',
    executionId: 'execution-1',
    isStopRequested: () => false,
    job: 'holiday.provider.pull',
    origin: 'schedule',
  })
  return {
    everything: JSON.stringify({ logged, result, records: [...store.records.values()] }),
    result,
  }
}

describe('o token da FeriadosAPI nunca aparece (spec 252 T3.5, CA9)', () => {
  test('nem no log, nem nos contadores, nem no que a rotina grava, por mais que o fornecedor o ecoe', async () => {
    for (const [label, echo] of ECHOES) {
      const { everything, result } = await runWithEcho(echo)

      expect(`${label}: ${everything.includes(TOKEN)}`).toBe(`${label}: false`)
      expect(result.outcome).not.toBe('succeeded')
    }
  })

  test('nem quando a falha é nossa e a mensagem do banco carrega o segredo', async () => {
    const { everything, result } = await runWithEcho(async () => jsonResponse([]), {
      storeFailsWith: new Error(`could not connect with ${TOKEN}`),
    })

    expect(everything).not.toContain(TOKEN)
    expect(result.outcome).toBe('unexpected_error')
  })
})
