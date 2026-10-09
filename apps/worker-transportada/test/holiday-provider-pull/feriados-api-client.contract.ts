/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { HolidayProviderRequest } from '../../src/holiday-provider-pull/application/holiday-provider-client.port.js'
import {
  HOLIDAY_PROVIDER_ERROR_CODE,
  HolidayProviderError,
  type HolidayProviderErrorCode,
} from '../../src/holiday-provider-pull/domain/holiday-provider.error.js'
import { createFeriadosApiClient } from '../../src/holiday-provider-pull/infrastructure/feriados-api.client.js'
import {
  buildFullPage,
  buildProviderHoliday,
  CAMPINAS_CITY_RESPONSE_2026,
  FERIADOS_API_FIXTURE_TOKEN,
  jsonResponse,
  NATIONAL_RESPONSE_2026,
  SAO_PAULO_STATE_RESPONSE_2026,
} from '../fixtures/feriados-api.fixture.js'

type Call = { readonly init: RequestInit; readonly url: string }

const CITY_REQUEST: HolidayProviderRequest = {
  ibgeCode: '3509502',
  page: 1,
  scope: 'city',
  year: 2026,
}

function buildClient(respond: (call: Call) => Promise<Response> | Response) {
  const calls: Call[] = []
  const client = createFeriadosApiClient({
    baseUrl: 'https://feriadosapi.test/',
    fetch: async (url, init) => {
      const call = { init, url }
      calls.push(call)
      return respond(call)
    },
    timeoutInMilliseconds: 15_000,
    token: FERIADOS_API_FIXTURE_TOKEN,
  })
  return { calls, client }
}

async function captureError(promise: Promise<unknown>): Promise<HolidayProviderError> {
  try {
    await promise
  } catch (error: unknown) {
    if (error instanceof HolidayProviderError) return error
    throw error
  }
  throw new Error('expected the client to throw')
}

describe('o cliente HTTP da FeriadosAPI (spec 252 T3.1)', () => {
  test('pede a cidade com Bearer, ano, limite de 100 e sem página na primeira', async () => {
    const { calls, client } = buildClient(() => jsonResponse(CAMPINAS_CITY_RESPONSE_2026))

    await client.fetchPage(CITY_REQUEST)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(
      'https://feriadosapi.test/api/v1/feriados/cidade/3509502?ano=2026&limit=100',
    )
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('authorization')).toBe(`Bearer ${FERIADOS_API_FIXTURE_TOKEN}`)
    expect(headers.get('accept')).toContain('application/json')
    expect(calls[0]?.init.method ?? 'GET').toBe('GET')
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
  })

  test('as páginas seguintes levam o número da página', async () => {
    const { calls, client } = buildClient(() => jsonResponse([]))

    await client.fetchPage({ ...CITY_REQUEST, page: 3 })

    expect(calls[0]?.url).toBe(
      'https://feriadosapi.test/api/v1/feriados/cidade/3509502?ano=2026&limit=100&page=3',
    )
  })

  test('o estado vai pela sigla da UF e o nacional pelo caminho próprio', async () => {
    const { calls, client } = buildClient(() => jsonResponse([]))

    await client.fetchPage({ ibgeCode: '35', page: 1, scope: 'state', year: 2027 })
    await client.fetchPage({ ibgeCode: 'BR', page: 1, scope: 'national', year: 2027 })

    expect(calls.map((call) => call.url)).toEqual([
      'https://feriadosapi.test/api/v1/feriados/estado/SP?ano=2027&limit=100',
      'https://feriadosapi.test/api/v1/feriados/nacionais?ano=2027&limit=100',
    ])
  })

  test('a resposta de uma cidade vira entradas: o estadual vai para a UF, o nacional fica fora', async () => {
    const { client } = buildClient(() => jsonResponse(CAMPINAS_CITY_RESPONSE_2026))

    const page = await client.fetchPage(CITY_REQUEST)

    expect(page.receivedCount).toBe(4)
    expect(page.entries).toEqual([
      {
        date: '2026-07-14',
        externalId: '101',
        ibgeCode: '3509502',
        isBanking: false,
        name: 'Aniversário de Campinas',
        providerType: 'MUNICIPAL',
        scope: 'city',
      },
      {
        date: '2026-07-09',
        externalId: '102',
        ibgeCode: '35',
        isBanking: false,
        name: 'Revolução Constitucionalista',
        providerType: 'ESTADUAL',
        scope: 'state',
      },
      {
        date: '2026-02-17',
        externalId: '103',
        ibgeCode: '3509502',
        isBanking: false,
        name: 'Carnaval',
        providerType: 'FACULTATIVO',
        scope: 'city',
      },
    ])
  })

  test('estado e nacional gravam sob a própria chave', async () => {
    const state = await buildClient(() =>
      jsonResponse(SAO_PAULO_STATE_RESPONSE_2026),
    ).client.fetchPage({
      ibgeCode: '35',
      page: 1,
      scope: 'state',
      year: 2026,
    })
    const national = await buildClient(() => jsonResponse(NATIONAL_RESPONSE_2026)).client.fetchPage(
      {
        ibgeCode: 'BR',
        page: 1,
        scope: 'national',
        year: 2026,
      },
    )

    expect(state.entries.map((entry) => [entry.scope, entry.ibgeCode, entry.date])).toEqual([
      ['state', '35', '2026-07-09'],
    ])
    expect(national.entries.map((entry) => [entry.scope, entry.ibgeCode, entry.date])).toEqual([
      ['national', 'BR', '2026-01-01'],
      ['national', 'BR', '2026-12-25'],
    ])
  })

  test('aceita a lista pelada e a lista embrulhada em `data`', async () => {
    const bare = await buildClient(() =>
      jsonResponse(SAO_PAULO_STATE_RESPONSE_2026),
    ).client.fetchPage({
      ibgeCode: '35',
      page: 1,
      scope: 'state',
      year: 2026,
    })
    const wrapped = await buildClient(() =>
      jsonResponse({ data: SAO_PAULO_STATE_RESPONSE_2026, page: 1, total: 1 }),
    ).client.fetchPage({ ibgeCode: '35', page: 1, scope: 'state', year: 2026 })

    expect(wrapped.entries).toEqual(bare.entries)
    expect(wrapped.entries).toHaveLength(1)
  })

  test('o facultativo e o municipal no mesmo dia viram uma entrada só: vence a não facultativa', async () => {
    const day = '07/09/2026'
    const orders = [
      [
        buildProviderHoliday({ data: day, id: 1, nome: 'Ponto facultativo', tipo: 'FACULTATIVO' }),
        buildProviderHoliday({ data: day, id: 2, nome: 'Dia da cidade', tipo: 'MUNICIPAL' }),
      ],
      [
        buildProviderHoliday({ data: day, id: 2, nome: 'Dia da cidade', tipo: 'MUNICIPAL' }),
        buildProviderHoliday({ data: day, id: 1, nome: 'Ponto facultativo', tipo: 'FACULTATIVO' }),
      ],
    ]

    for (const response of orders) {
      const page = await buildClient(() => jsonResponse(response)).client.fetchPage(CITY_REQUEST)

      expect(page.receivedCount).toBe(2)
      expect(page.entries).toHaveLength(1)
      expect(page.entries[0]?.providerType).toBe('MUNICIPAL')
      expect(page.entries[0]?.name).toBe('Dia da cidade')
    }
  })

  test('o nome é aparado e nunca passa de 120 caracteres', async () => {
    const longName = `  ${'Á'.repeat(150)}  `
    const { client } = buildClient(() =>
      jsonResponse([
        buildProviderHoliday({ data: '01/05/2026', nome: longName, tipo: 'MUNICIPAL' }),
      ]),
    )

    const page = await client.fetchPage(CITY_REQUEST)

    expect(Array.from(page.entries[0]?.name ?? '')).toHaveLength(120)
    expect(page.entries[0]?.name).toBe('Á'.repeat(120))
  })

  test('uma página cheia diz quantas linhas vieram, para o chamador decidir se há mais', async () => {
    const { client } = buildClient(() => jsonResponse(buildFullPage({ firstDay: 0 })))

    const page = await client.fetchPage(CITY_REQUEST)

    expect(page.receivedCount).toBe(100)
  })

  test('cobra o tipo certo para cada status que o fornecedor devolve', async () => {
    const expectations: ReadonlyArray<readonly [number, HolidayProviderErrorCode]> = [
      [401, HOLIDAY_PROVIDER_ERROR_CODE.UNAUTHORIZED],
      [403, HOLIDAY_PROVIDER_ERROR_CODE.UNAUTHORIZED],
      [404, HOLIDAY_PROVIDER_ERROR_CODE.NOT_FOUND],
      [429, HOLIDAY_PROVIDER_ERROR_CODE.RATE_LIMITED],
      [500, HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE],
      [502, HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE],
      [503, HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE],
    ]

    for (const [status, code] of expectations) {
      const { client } = buildClient(() => jsonResponse({ detail: 'x' }, { status }))

      const error = await captureError(client.fetchPage(CITY_REQUEST))

      expect(error.code).toBe(code)
    }
  })

  test('429 devolve o Retry-After em segundos, em número ou em data HTTP', async () => {
    const seconds = await captureError(
      buildClient(() =>
        jsonResponse({}, { headers: { 'retry-after': '120' }, status: 429 }),
      ).client.fetchPage(CITY_REQUEST),
    )
    const none = await captureError(
      buildClient(() => jsonResponse({}, { status: 429 })).client.fetchPage(CITY_REQUEST),
    )
    const inOneHour = new Date(Date.now() + 3_600_000).toUTCString()
    const dated = await captureError(
      buildClient(() =>
        jsonResponse({}, { headers: { 'retry-after': inOneHour }, status: 429 }),
      ).client.fetchPage(CITY_REQUEST),
    )

    expect(seconds.retryAfterSeconds).toBe(120)
    expect(none.retryAfterSeconds).toBeUndefined()
    expect(dated.retryAfterSeconds).toBeGreaterThan(3_000)
    expect(dated.retryAfterSeconds).toBeLessThanOrEqual(3_600)
  })

  test('rede caída e tempo esgotado são `provider_unreachable`', async () => {
    const failures = [new TypeError('fetch failed'), new DOMException('timeout', 'TimeoutError')]

    for (const failure of failures) {
      const { client } = buildClient(() => Promise.reject(failure))

      const error = await captureError(client.fetchPage(CITY_REQUEST))

      expect(error.code).toBe(HOLIDAY_PROVIDER_ERROR_CODE.UNREACHABLE)
    }
  })

  test('resposta fora do formato é `malformed_response` — e nada vira entrada', async () => {
    const malformedBodies: readonly unknown[] = [
      { feriados: [] },
      'texto solto',
      42,
      [{ data: '01/05/2026', tipo: 'MUNICIPAL' }],
      [{ data: '01/05/2026', nome: '', tipo: 'MUNICIPAL' }],
      [{ data: '01/05/2026', nome: '   ', tipo: 'MUNICIPAL' }],
      [{ data: '31/02/2026', nome: 'Dia que não existe', tipo: 'MUNICIPAL' }],
      [{ data: '2026-05-01', nome: 'Data em ISO', tipo: 'MUNICIPAL' }],
      [{ data: '1/5/2026', nome: 'Data sem zero', tipo: 'MUNICIPAL' }],
      [{ data: '01/05/2026', nome: 'Tipo novo', tipo: 'SEMANA_SANTA' }],
      [{ data: 20260501, nome: 'Data numérica', tipo: 'MUNICIPAL' }],
      [
        buildProviderHoliday({ data: '01/05/2026', nome: 'Boa', tipo: 'MUNICIPAL' }),
        { data: '99/99/2026', nome: 'Ruim', tipo: 'MUNICIPAL' },
      ],
    ]

    for (const body of malformedBodies) {
      const { client } = buildClient(() => jsonResponse(body))

      const error = await captureError(client.fetchPage(CITY_REQUEST))

      expect(error.code).toBe(HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE)
    }
  })

  test('corpo que não é JSON também é `malformed_response`', async () => {
    const { client } = buildClient(() => new Response('<html>oops</html>', { status: 200 }))

    const error = await captureError(client.fetchPage(CITY_REQUEST))

    expect(error.code).toBe(HOLIDAY_PROVIDER_ERROR_CODE.MALFORMED_RESPONSE)
  })

  test('o token não aparece em nenhuma mensagem de erro, nem quando o fornecedor ou a rede o ecoam', async () => {
    const echoes: ReadonlyArray<() => Promise<Response> | Response> = [
      () => Promise.reject(new TypeError(`connect failed Bearer ${FERIADOS_API_FIXTURE_TOKEN}`)),
      () => new Response(`Bearer ${FERIADOS_API_FIXTURE_TOKEN} rejected`, { status: 500 }),
      () => jsonResponse({ echo: FERIADOS_API_FIXTURE_TOKEN }, { status: 401 }),
      () => jsonResponse({ echo: FERIADOS_API_FIXTURE_TOKEN }, { status: 429 }),
      () => new Response(`not json ${FERIADOS_API_FIXTURE_TOKEN}`, { status: 200 }),
      () => jsonResponse([{ data: 'x', nome: FERIADOS_API_FIXTURE_TOKEN, tipo: 'MUNICIPAL' }]),
    ]

    for (const respond of echoes) {
      const { client } = buildClient(respond)

      const error = await captureError(client.fetchPage(CITY_REQUEST))

      const everything = [
        error.message,
        error.name,
        String(error),
        JSON.stringify(error),
        error.stack ?? '',
        String(error.cause ?? ''),
      ].join('\n')
      expect(everything).not.toContain(FERIADOS_API_FIXTURE_TOKEN)
    }
  })
})
