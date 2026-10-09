/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { HolidayProviderPage } from '../../src/holiday-provider-pull/application/holiday-provider-client.port.js'
import { createFetchHolidayProviderUseCase } from '../../src/holiday-provider-pull/application/fetch-holiday-provider.use-case.js'
import {
  HOLIDAY_PROVIDER_ERROR_CODE,
  HolidayProviderError,
  type HolidayProviderErrorCode,
} from '../../src/holiday-provider-pull/domain/holiday-provider.error.js'
import type {
  HolidayProviderRequest,
  ProviderHolidayEntry,
} from '../../src/holiday-provider-pull/domain/holiday-provider.types.js'
import {
  buildFakeClock,
  buildInMemoryFetchStore,
  buildScriptedClient,
  pairKey,
} from '../fixtures/holiday-fetch.fixture.js'

const NOW = new Date('2026-10-09T12:00:00.000Z')
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const CAMPINAS = '3509502'
const SANTOS = '3548500'
const SAO_JOSE = '3549904'

function entry(
  input: Partial<ProviderHolidayEntry> & Pick<ProviderHolidayEntry, 'date' | 'ibgeCode' | 'scope'>,
): ProviderHolidayEntry {
  return {
    externalId: null,
    isBanking: false,
    name: 'Feriado',
    providerType:
      input.scope === 'city' ? 'MUNICIPAL' : input.scope === 'state' ? 'ESTADUAL' : 'NACIONAL',
    ...input,
  }
}

function pageOf(entries: readonly ProviderHolidayEntry[]): HolidayProviderPage {
  return { entries, receivedCount: entries.length }
}

/** Resposta da cidade com ou sem o estadual dentro, como o fornecedor falso decide. */
function cityResponse(request: HolidayProviderRequest, withState: boolean): HolidayProviderPage {
  const city = entry({ date: `${request.year}-07-14`, ibgeCode: request.ibgeCode, scope: 'city' })
  const state = entry({
    date: `${request.year}-07-09`,
    ibgeCode: request.ibgeCode.slice(0, 2),
    scope: 'state',
  })
  return pageOf(withState ? [city, state] : [city])
}

function defaultResponse(request: HolidayProviderRequest, withState = true): HolidayProviderPage {
  if (request.scope === 'city') return cityResponse(request, withState)
  const date = `${request.year}-07-09`
  return pageOf([entry({ date, ibgeCode: request.ibgeCode, scope: request.scope })])
}

function failWith(code: HolidayProviderErrorCode, retryAfterSeconds?: number): never {
  throw new HolidayProviderError({ code, retryAfterSeconds })
}

type Setup = {
  readonly budget?: number
  readonly demand?: ReadonlyArray<{ readonly ibgeCode: string; readonly total: number }>
  readonly requestCeiling?: number
  readonly onRespond?: (request: HolidayProviderRequest) => HolidayProviderPage
  readonly respond?: (request: HolidayProviderRequest) => HolidayProviderPage
  readonly store?: ReturnType<typeof buildInMemoryFetchStore>
  readonly now?: Date
}

function setup(input: Setup = {}) {
  const fake = buildFakeClock()
  const events: string[] = []
  const store =
    input.store ??
    buildInMemoryFetchStore({
      demand: input.demand ?? [
        { ibgeCode: CAMPINAS, total: 30 },
        { ibgeCode: SANTOS, total: 20 },
        { ibgeCode: SAO_JOSE, total: 10 },
      ],
      events,
    })
  const client = buildScriptedClient({
    clock: fake.clock,
    events: store.events,
    respond: input.respond ?? input.onRespond ?? ((request) => defaultResponse(request)),
  })
  const logged: unknown[][] = []
  const record = (...args: unknown[]) => {
    logged.push(args)
  }
  const useCase = createFetchHolidayProviderUseCase({
    budget: input.budget ?? 5000,
    client,
    clock: fake.clock,
    logger: { debug: record, error: record, info: record, warn: record } as never,
    now: () => input.now ?? NOW,
    requestCeiling: input.requestCeiling,
    store,
  })
  const run = (isStopRequested: () => boolean = () => false) => useCase.execute({ isStopRequested })
  return { client, events: store.events, fake, logged, run, store }
}

describe('a busca no fornecedor (spec 252 T3.3, CA3)', () => {
  test('3 cidades × 2 anos = 6 requisições de cidade, todas espaçadas de 1,2 s ou mais', async () => {
    const { client, run } = setup()

    const tally = await run()

    expect(client.requests.filter((request) => request.scope === 'city')).toHaveLength(6)
    // Mais a paridade nacional, 1 por ano do horizonte (D4).
    expect(client.requests.filter((request) => request.scope === 'national')).toHaveLength(2)
    expect(tally.requests).toBe(8)
    for (let index = 1; index < client.requests.length; index += 1) {
      const gap =
        (client.requests[index]?.atMilliseconds ?? 0) -
        (client.requests[index - 1]?.atMilliseconds ?? 0)
      expect(gap).toBeGreaterThanOrEqual(1200)
    }
  })

  test('a ordem é a demanda decrescente, e o horizonte é o ano corrente e o seguinte', async () => {
    const { client, run } = setup()

    await run()

    expect(
      client.requests
        .filter((request) => request.scope === 'city')
        .map((request) => `${request.ibgeCode}:${request.year}`),
    ).toEqual([
      `${CAMPINAS}:2026`,
      `${CAMPINAS}:2027`,
      `${SANTOS}:2026`,
      `${SANTOS}:2027`,
      `${SAO_JOSE}:2026`,
      `${SAO_JOSE}:2027`,
    ])
  })

  test('o espaçamento desconta o tempo que a própria chamada levou', async () => {
    const holder: { advance: (milliseconds: number) => void } = { advance: () => undefined }
    const { client, fake, run } = setup({
      demand: [{ ibgeCode: CAMPINAS, total: 1 }],
      onRespond: (request) => {
        holder.advance(500)
        return defaultResponse(request)
      },
    })
    holder.advance = fake.advance

    await run()

    // A 1ª chamada não espera; cada uma das demais completa 1,2 s contando os 0,5 s da anterior.
    expect(fake.sleeps).toHaveLength(client.requests.length - 1)
    expect(fake.sleeps.every((waited) => waited === 700)).toBeTrue()
  })

  test('repetir o ciclo dá 0 requisições e 0 escritas', async () => {
    const { client, events, run } = setup()
    await run()
    const requestsAfterFirst = client.requests.length
    const eventsAfterFirst = events.length

    const second = await run()

    expect(second.requests).toBe(0)
    expect(client.requests).toHaveLength(requestsAfterFirst)
    expect(events).toHaveLength(eventsAfterFirst)
  })

  test('o teto de 100 requisições por ciclo vale, e o resto fica para o ciclo seguinte', async () => {
    const demand = Array.from({ length: 60 }, (_, index) => ({
      ibgeCode: `35${String(10000 + index)}`,
      total: 1000 - index,
    }))
    const { client, run } = setup({ demand })

    const first = await run()
    const second = await run()
    const third = await run()

    expect(first.requests).toBe(100)
    expect(first.ceilingReached).toBeTrue()
    // 60 cidades × 2 anos + 2 nacionais = 122 pares; 22 sobram.
    expect(second.requests).toBe(22)
    expect(second.ceilingReached).toBeFalse()
    expect(third.requests).toBe(0)
    expect(client.requests).toHaveLength(122)
  })

  test('o orçamento é pedido antes de cada chamada, e nunca passa do número configurado', async () => {
    const { client, events, run, store } = setup({ budget: 4 })

    const tally = await run()

    expect(tally.requests).toBe(4)
    expect(tally.budgetExhausted).toBeTrue()
    expect(client.requests).toHaveLength(4)
    expect(store.budgetGrants()).toBe(4)
    const calls = events.filter((event) => event === 'claim' || event.startsWith('request:'))
    expect(calls.slice(0, 8)).toEqual([
      'claim',
      expect.stringMatching(/^request:/u),
      'claim',
      expect.stringMatching(/^request:/u),
      'claim',
      expect.stringMatching(/^request:/u),
      'claim',
      expect.stringMatching(/^request:/u),
    ])
    expect(calls.at(-1)).toBe('claim')
  })

  test('orçamento esgotado marca o par em curso e os que sobraram como `quota_exhausted` até o dia 1º', async () => {
    const { run, store } = setup({ budget: 4 })

    await run()

    const exhausted = [...store.records.values()].filter(
      (record) => record.status === 'quota_exhausted',
    )
    for (const record of exhausted) {
      expect(record.nextAttemptAt.toISOString()).toBe('2026-11-01T03:00:00.000Z')
    }
    // Os 4 pares feitos (2 nacionais e a 1ª cidade nos dois anos) ficam de fora; os 4 que sobraram entram.
    expect(exhausted.map((record) => pairKey(record.pair)).toSorted()).toEqual([
      `city:${SANTOS}:2026`,
      `city:${SANTOS}:2027`,
      `city:${SAO_JOSE}:2026`,
      `city:${SAO_JOSE}:2027`,
    ])
  })

  test('401 e 403 encerram o ciclo sem nova requisição e sem tocar no par', async () => {
    const { client, run, store } = setup({
      respond: () => failWith(HOLIDAY_PROVIDER_ERROR_CODE.UNAUTHORIZED),
    })

    const tally = await run()

    expect(tally.unauthorized).toBeTrue()
    expect(tally.requests).toBe(1)
    expect(client.requests).toHaveLength(1)
    expect(store.records.size).toBe(0)
  })

  test('429 encerra o ciclo e o par só volta depois do Retry-After', async () => {
    const withHeader = setup({
      respond: () => failWith(HOLIDAY_PROVIDER_ERROR_CODE.RATE_LIMITED, 120),
    })
    const withoutHeader = setup({
      respond: () => failWith(HOLIDAY_PROVIDER_ERROR_CODE.RATE_LIMITED),
    })

    const tally = await withHeader.run()
    await withoutHeader.run()

    expect(tally.rateLimited).toBeTrue()
    expect(withHeader.client.requests).toHaveLength(1)
    const [record] = [...withHeader.store.records.values()]
    expect(record?.status).toBe('failed')
    expect(record?.errorCode).toBe('provider_rate_limited')
    expect(record?.attempts).toBe(0)
    expect(record?.nextAttemptAt.getTime()).toBe(NOW.getTime() + 120_000)
    const [noHeaderRecord] = [...withoutHeader.store.records.values()]
    expect(noHeaderRecord?.nextAttemptAt.getTime()).toBe(NOW.getTime() + HOUR_MS)
  })

  test('404 marca `not_covered` por 90 dias e a busca segue', async () => {
    const { client, run, store } = setup({
      respond: (request) =>
        request.ibgeCode === CAMPINAS && request.scope === 'city'
          ? failWith(HOLIDAY_PROVIDER_ERROR_CODE.NOT_FOUND)
          : defaultResponse(request),
    })

    const tally = await run()

    const record = store.records.get(pairKey({ ibgeCode: CAMPINAS, scope: 'city', year: 2026 }))
    expect(record?.status).toBe('not_covered')
    expect(record?.nextAttemptAt.getTime()).toBe(NOW.getTime() + 90 * DAY_MS)
    expect(tally.pairsNotCovered).toBe(2)
    expect(client.requests.some((request) => request.ibgeCode === SANTOS)).toBeTrue()
  })

  test('5xx e rede caída viram `failed` com recuo de 1 h, e a busca segue com as outras cidades', async () => {
    const { client, run, store } = setup({
      respond: (request) =>
        request.ibgeCode === SANTOS
          ? failWith(HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE)
          : defaultResponse(request),
    })

    const tally = await run()

    const record = store.records.get(pairKey({ ibgeCode: SANTOS, scope: 'city', year: 2026 }))
    expect(record?.status).toBe('failed')
    expect(record?.errorCode).toBe('provider_unreachable')
    expect(record?.attempts).toBe(1)
    expect(record?.nextAttemptAt.getTime()).toBe(NOW.getTime() + HOUR_MS)
    expect(tally.unreachable).toBe(2)
    expect(client.requests.some((request) => request.ibgeCode === SAO_JOSE)).toBeTrue()
    expect(
      store.records.get(pairKey({ ibgeCode: SAO_JOSE, scope: 'city', year: 2026 }))?.status,
    ).toBe('done')
  })

  test('a falha seguinte do mesmo par recua 6 h; resposta fora do formato recua do mesmo jeito, sem gravar nada', async () => {
    const { run, store } = setup({
      demand: [{ ibgeCode: CAMPINAS, total: 1 }],
      respond: (request) =>
        request.scope === 'city'
          ? failWith(HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE)
          : defaultResponse(request),
    })
    const key = pairKey({ ibgeCode: CAMPINAS, scope: 'city', year: 2026 })
    store.records.set(key, {
      attempts: 1,
      errorCode: 'provider_unreachable',
      fetchedAt: null,
      nextAttemptAt: new Date(NOW.getTime() - 1),
      pair: { attempts: 1, ibgeCode: CAMPINAS, scope: 'city', year: 2026 },
      status: 'failed',
    })

    const tally = await run()

    const record = store.records.get(key)
    expect(record?.attempts).toBe(2)
    expect(record?.errorCode).toBe('malformed_response')
    expect(record?.nextAttemptAt.getTime()).toBe(NOW.getTime() + 6 * HOUR_MS)
    expect(tally.malformedResponses).toBe(2)
    expect(store.saved.every((saved) => saved.pair.scope !== 'city')).toBeTrue()
  })

  test('uma falha nossa na gravação conta como inesperada, não derruba o ciclo e o log não vaza o texto', async () => {
    const { client, logged, run, store } = setup({ demand: [{ ibgeCode: CAMPINAS, total: 1 }] })
    const original = store.saveSuccess
    let first = true
    store.saveSuccess = async (params) => {
      if (first && params.pair.scope === 'city') {
        first = false
        throw new Error('deadlock on 11222333000181')
      }
      return original(params)
    }

    const tally = await run()

    expect(tally.unexpectedFailures).toBe(1)
    expect(client.requests.length).toBeGreaterThan(2)
    expect(JSON.stringify(logged)).not.toContain('11222333000181')
  })

  test('página cheia pede a seguinte; para quando vem menos de 100 ou nada novo', async () => {
    const fullPage = (request: HolidayProviderRequest, offset: number): HolidayProviderPage => ({
      entries: Array.from({ length: 100 }, (_, index) =>
        entry({
          date: `${request.year}-${String(Math.floor((offset + index) / 28) + 1).padStart(2, '0')}-${String(((offset + index) % 28) + 1).padStart(2, '0')}`,
          ibgeCode: request.ibgeCode,
          scope: 'city',
        }),
      ),
      receivedCount: 100,
    })
    const paged = setup({
      demand: [{ ibgeCode: CAMPINAS, total: 1 }],
      respond: (request) => {
        if (request.scope !== 'city') return defaultResponse(request)
        if (request.page === 1) return fullPage(request, 0)
        if (request.page === 2) return fullPage(request, 100)
        return pageOf([
          entry({ date: `${request.year}-12-25`, ibgeCode: request.ibgeCode, scope: 'city' }),
        ])
      },
    })
    const stuck = setup({
      demand: [{ ibgeCode: CAMPINAS, total: 1 }],
      respond: (request) =>
        request.scope === 'city' ? fullPage(request, 0) : defaultResponse(request),
    })

    await paged.run()
    await stuck.run()

    const pages = paged.client.requests
      .filter((request) => request.scope === 'city' && request.year === 2026)
      .map((request) => request.page)
    expect(pages).toEqual([1, 2, 3])
    const saved = paged.store.saved.find(
      (candidate) => candidate.pair.scope === 'city' && candidate.pair.year === 2026,
    )
    expect(saved?.entries.length).toBe(201)
    // A API que ignora `page` devolve a mesma página: a 2ª não traz nada novo e a busca para.
    expect(
      stuck.client.requests
        .filter((request) => request.scope === 'city' && request.year === 2026)
        .map((request) => request.page),
    ).toEqual([1, 2])
  })

  test('o estadual só é pedido quando a resposta da cidade não o trouxe, uma vez por UF e ano', async () => {
    const without = setup({ respond: (request) => defaultResponse(request, false) })
    const withState = setup({ respond: (request) => defaultResponse(request, true) })

    await without.run()
    await withState.run()

    const stateRequests = without.client.requests.filter((request) => request.scope === 'state')
    expect(stateRequests.map((request) => `${request.ibgeCode}:${request.year}`)).toEqual([
      '35:2026',
      '35:2027',
    ])
    expect(withState.client.requests.filter((request) => request.scope === 'state')).toHaveLength(0)
    // A resposta da cidade que trouxe o estadual cobre o par do estado.
    expect(
      withState.store.records.get(pairKey({ ibgeCode: '35', scope: 'state', year: 2026 }))?.status,
    ).toBe('done')
  })

  test('a parada pedida é lida entre as requisições e deixa o par em curso intacto', async () => {
    let calls = 0
    const { client, run, store } = setup()

    const tally = await run(() => {
      calls += 1
      return calls > 3
    })

    expect(tally.requests).toBeLessThanOrEqual(3)
    expect(client.requests.length).toBe(tally.requests)
    expect(store.records.size).toBeLessThanOrEqual(3)
  })

  test('na virada do ano em São Paulo o horizonte anda um ano', async () => {
    const { client, run } = setup({
      demand: [{ ibgeCode: CAMPINAS, total: 1 }],
      now: new Date('2027-01-01T03:00:00.000Z'),
    })

    await run()

    expect([
      ...new Set(
        client.requests
          .filter((request) => request.scope === 'city')
          .map((request) => request.year),
      ),
    ]).toEqual([2027, 2028])
  })
})
