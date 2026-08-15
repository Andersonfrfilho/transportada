/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  ADJUSTED_FUEL_PRICE,
  FUEL_PRICE_ENTRIES,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
  type FuelPriceEntryContract,
} from './company-settings.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_MODULE = '../../src/modules/company-settings/shared/companySettingsClient.service'
const SERVICE_MODULE = '../../src/modules/company-settings/shared/fuelPrice.service'
const FUEL_PRICES_URL = 'https://transportada.test/company-settings/fuel-prices'

/** O catálogo da tela é o mesmo da API: cinco produtos, a unidade presa ao produto. */
const FUEL_PRODUCTS = [
  'diesel-s10',
  'diesel-s500',
  'gasolina-comum',
  'etanol-hidratado',
  'gnv',
] as const

const PANEL_LABEL_KEYS = [
  'fuelPricesTitle',
  'fuelPricesHint',
  'fuelPriceEffective',
  'fuelPriceUnavailable',
  'fuelPriceReference',
  'fuelPriceReferenceMissing',
  'fuelPriceUpdatedAt',
  'fuelPriceFieldLabel',
  'fuelPriceFieldHint',
  'fuelPriceSave',
  'fuelPriceClear',
  'fuelPriceSaved',
  'fuelPriceError',
  'fuelPriceLoadError',
  'fuelPriceSourceAnp',
  'fuelPriceSourceManual',
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
  readonly FUEL_PRICE_SOURCE_LABEL_KEYS: Readonly<Record<string, string>>
  readonly formatFuelPricePerUnit: (value: string) => string
  readonly toFuelPricePerUnit: (draft: string) => null | string
}

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readModule(filePath)) as Record<string, unknown>
}

function readLocaleKey(locale: Record<string, unknown>, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (current, part) =>
        current !== null && typeof current === 'object'
          ? (current as Record<string, unknown>)[part]
          : undefined,
      locale,
    )
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

  test('cada origem de preço da API tem rótulo próprio nos dois catálogos', async () => {
    const { FUEL_PRICE_SOURCE_LABEL_KEYS } =
      await loadFutureModule<FuelPriceServiceModule>(SERVICE_MODULE)
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/company-settings/locales/companySettings.locale.json'),
      readLocale('src/modules/company-settings/locales/companySettings.en.locale.json'),
    ])

    expect(Object.keys(FUEL_PRICE_SOURCE_LABEL_KEYS).sort()).toEqual(['anp', 'manual'])
    for (const source of ['anp', 'manual']) {
      const key = FUEL_PRICE_SOURCE_LABEL_KEYS[source] ?? ''
      expect(readLocaleKey(portuguese, key)).toBeString()
      expect(readLocaleKey(english, key)).toBeString()
    }
  })
})

describe('fuel price presentation contract', () => {
  test('traduz cada rótulo do painel e cada combustível nos dois catálogos', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/company-settings/locales/companySettings.locale.json'),
      readLocale('src/modules/company-settings/locales/companySettings.en.locale.json'),
    ])

    for (const key of PANEL_LABEL_KEYS) {
      expect(portuguese[key]).toBeString()
      expect(english[key]).toBeString()
    }
    for (const product of FUEL_PRODUCTS) {
      expect(readLocaleKey(portuguese, `fuelOption.${product}`)).toBeString()
      expect(readLocaleKey(english, `fuelOption.${product}`)).toBeString()
    }
  })

  test('desenha uma linha por combustível do catálogo, e não só as que têm preço', async () => {
    const component = await readModule(
      'src/modules/company-settings/components/FuelPricePanel.component.tsx',
    )

    expect(component).toContain('FUEL_PRODUCTS')
    expect(component).toContain('fuelOption.')
  })

  test('a referência da ANP fica ao lado do valor efetivo, como comparação', async () => {
    const component = await readModule(
      'src/modules/company-settings/components/FuelPricePanel.component.tsx',
    )

    expect(component).toContain('fuelPriceEffective')
    expect(component).toContain('fuelPriceReference')
    expect(component).toContain('reference')
  })

  test('a ação de limpar só existe onde há ajuste da transportadora', async () => {
    const component = await readModule(
      'src/modules/company-settings/components/FuelPricePanel.component.tsx',
    )

    expect(component).toContain("source === 'manual'")
    expect(component).toContain('fuelPriceClear')
    expect(component).toContain('onClear')
  })

  test('o painel entra na tela com esqueleto e sem controle fora do design system', async () => {
    const [component, hook, page] = await Promise.all([
      readModule('src/modules/company-settings/components/FuelPricePanel.component.tsx'),
      readModule('src/modules/company-settings/hooks/useFuelPrices.hook.ts'),
      readModule('src/modules/company-settings/pages/CompanySettings.page.tsx'),
    ])

    expect(page).toContain('<FuelPricePanel')
    expect(component).toContain('Skeleton')
    expect(component).toContain('Icon')
    expect(component).not.toContain('<svg')
    expect(component).not.toContain('<select')
    expect(component).not.toContain("type='checkbox'")
    expect(component).not.toContain('type="checkbox"')
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    for (const method of ['adjustFuelPrice', 'clearFuelPrice', 'getFuelPrices']) {
      expect(hook).toContain(method)
    }
  })
})
