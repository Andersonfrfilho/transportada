/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  ADJUSTED_FUEL_PRICE,
  ENERGY_TARIFF,
  FUEL_PRICE_ENTRIES,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
  type FuelPriceEntryContract,
} from './company-settings.fixture'

const CLIENT_MODULE = '../../src/modules/company-settings/shared/companySettingsClient.service'
const SERVICE_MODULE = '../../src/modules/company-settings/shared/fuelPrice.service'
const FUEL_PRICES_URL = 'https://transportada.test/company-settings/fuel-prices'

/** O catálogo da tela é o mesmo da API: seis produtos, a unidade presa ao produto. */
const FUEL_PRODUCTS = [
  'diesel-s10',
  'diesel-s500',
  'gasolina-comum',
  'etanol-hidratado',
  'gnv',
  'eletrico',
] as const

type CompanySettingsClientModule = {
  readonly createCompanySettingsClient: (input: {
    readonly apiBaseUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => {
    readonly adjustFuelPrice: (
      input: Readonly<{ pricePerUnit: string; product: string }>,
    ) => Promise<FuelPriceEntryContract>
    readonly clearFuelPrice: (product: string) => Promise<void>
    readonly getFuelPrices: () => Promise<readonly FuelPriceEntryContract[]>
  }
}

type FuelPriceServiceModule = {
  readonly formatFuelPricePerUnit: (value: string) => string
  readonly toFuelPricePerUnit: (draft: string) => null | string
}

async function fuelPriceClient(fetch: (request: Request) => Promise<Response>) {
  const { createCompanySettingsClient } =
    await loadFutureModule<CompanySettingsClientModule>(CLIENT_MODULE)
  return createCompanySettingsClient({
    apiBaseUrl: 'https://transportada.test',
    fetch,
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
  })
}

describe('fuel price client contract', () => {
  test('lê o preço efetivo de cada combustível na rota de configurações', async () => {
    const fetch = mock((request: Request): Promise<Response> => {
      expect(request.url).toBe(FUEL_PRICES_URL)
      expect(request.method).toBe('GET')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      expect(request.cache).toBe('no-store')
      return Promise.resolve(Response.json({ data: FUEL_PRICE_ENTRIES }))
    })

    const prices = await (await fuelPriceClient(fetch)).getFuelPrices()

    expect(prices).toEqual([...FUEL_PRICE_ENTRIES])
    expect(prices.map((price) => price.product)).toEqual([...FUEL_PRODUCTS])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('ajusta o preço com PUT no slug do produto, nunca num identificador opaco', async () => {
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.url).toBe(`${FUEL_PRICES_URL}/gnv`)
      expect(request.method).toBe('PUT')
      expect(request.headers.get('content-type')).toBe('application/json')
      expect(await request.json()).toEqual({ pricePerUnit: '4.9900' })
      return Response.json({ data: ADJUSTED_FUEL_PRICE })
    })

    const price = await (
      await fuelPriceClient(fetch)
    ).adjustFuelPrice({ pricePerUnit: '4.9900', product: 'gnv' })

    expect(price).toEqual(ADJUSTED_FUEL_PRICE)
  })

  test('limpa o ajuste com DELETE e não espera corpo nenhum de volta', async () => {
    const fetch = mock((request: Request): Promise<Response> => {
      expect(request.url).toBe(`${FUEL_PRICES_URL}/diesel-s500`)
      expect(request.method).toBe('DELETE')
      return Promise.resolve(new Response(null, { status: 204 }))
    })

    expect(await (await fuelPriceClient(fetch)).clearFuelPrice('diesel-s500')).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('recusa uma linha que não descreve o preço inteiro', async () => {
    const fetch = mock(() =>
      Promise.resolve(Response.json({ data: [{ product: 'gnv', source: 'anp' }] })),
    )

    expect((await fuelPriceClient(fetch)).getFuelPrices()).rejects.toThrow(
      'COMPANY_SETTINGS_RESPONSE_INVALID',
    )
  })

  test('recusa um produto fora do catálogo em vez de desenhar uma linha inventada', async () => {
    const fetch = mock(() =>
      Promise.resolve(
        Response.json({ data: [{ ...FUEL_PRICE_ENTRIES[0], product: 'diesel-s1000' }] }),
      ),
    )

    expect((await fuelPriceClient(fetch)).getFuelPrices()).rejects.toThrow(
      'COMPANY_SETTINGS_RESPONSE_INVALID',
    )
  })

  /**
   * O guard é de chaves exatas: campo novo na resposta que ele não conhece derruba a tela inteira
   * com 200 no fio. A tarifa da ANEEL é esse campo, e o elétrico é a linha que a carrega.
   */
  test('aceita a tarifa da ANEEL ao lado do preço do elétrico', async () => {
    const fetch = mock(() => Promise.resolve(Response.json({ data: FUEL_PRICE_ENTRIES })))

    const prices = await (await fuelPriceClient(fetch)).getFuelPrices()
    const electric = prices.find((price) => price.product === 'eletrico')

    expect(electric?.source).toBe('aneel')
    expect(electric?.tariff).toEqual(ENERGY_TARIFF)
    expect(electric?.unit).toBe('kilowatt-hour')
    expect(prices.filter((price) => price.tariff !== null)).toHaveLength(1)
  })

  test('recusa uma tarifa pela metade em vez de desenhar parcela que não veio', async () => {
    const fetch = mock(() =>
      Promise.resolve(
        Response.json({
          data: [{ ...FUEL_PRICE_ENTRIES[5], tariff: { ...ENERGY_TARIFF, tePerMegawattHour: '' } }],
        }),
      ),
    )

    expect((await fuelPriceClient(fetch)).getFuelPrices()).rejects.toThrow(
      'COMPANY_SETTINGS_RESPONSE_INVALID',
    )
  })

  test('recusa uma origem de preço que a tela não sabe nomear', async () => {
    const fetch = mock(() =>
      Promise.resolve(
        Response.json({ data: [{ ...FUEL_PRICE_ENTRIES[0], source: 'aneelzinha' }] }),
      ),
    )

    expect((await fuelPriceClient(fetch)).getFuelPrices()).rejects.toThrow(
      'COMPANY_SETTINGS_RESPONSE_INVALID',
    )
  })

  test('propaga o código de erro da API sem inventar mensagem', async () => {
    const fetch = mock(() =>
      Promise.resolve(Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })),
    )

    expect(
      (await fuelPriceClient(fetch)).adjustFuelPrice({ pricePerUnit: '4.9900', product: 'gnv' }),
    ).rejects.toThrow('FORBIDDEN')
  })
})

describe('fuel price draft contract', () => {
  test('normaliza o que o operador digita para as quatro casas que a API aceita', async () => {
    const { toFuelPricePerUnit } = await loadFutureModule<FuelPriceServiceModule>(SERVICE_MODULE)

    expect(toFuelPricePerUnit('6,24')).toBe('6.2400')
    expect(toFuelPricePerUnit('6.24')).toBe('6.2400')
    expect(toFuelPricePerUnit(' 4 ')).toBe('4.0000')
    // A quinta casa arredonda para a escala da API, em vez de recusar o ajuste
    expect(toFuelPricePerUnit('6,24005')).toBe('6.2401')
  })

  test('devolve nulo para rascunho que não é preço, para o botão continuar desligado', async () => {
    const { toFuelPricePerUnit } = await loadFutureModule<FuelPriceServiceModule>(SERVICE_MODULE)

    for (const draft of ['', '   ', 'abc', '-1', '1,2,3', '.']) {
      expect(toFuelPricePerUnit(draft)).toBeNull()
    }
  })

  test('formata o preço em real com as quatro casas que a ANP publica', async () => {
    const { formatFuelPricePerUnit } =
      await loadFutureModule<FuelPriceServiceModule>(SERVICE_MODULE)

    // O separador do `Intl` em pt-BR é espaço inquebrável — comparar com espaço comum falha
    expect(formatFuelPricePerUnit('6.2400')).toBe('R$ 6,2400')
  })
})
