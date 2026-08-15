/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ADJUSTED_AT,
  adjustPriceRequest,
  clearPriceRequest,
  COMPANY_ID,
  COMPANY_STATE,
  createFuelPriceHttpFixture,
  FRONTEND_ORIGIN,
  FUEL_PRICES_PATH,
  listPricesRequest,
  REFERENCE_WEEK_ENDING_ON,
} from '../fixtures/fuel-price-http.fixture'

const DIESEL_REFERENCE = {
  pricePerUnit: '6.1230',
  state: COMPANY_STATE,
  weekEndingOn: REFERENCE_WEEK_ENDING_ON,
}

/**
 * O corpo carrega os cinco produtos do catálogo mesmo sem preço nenhum: a tela desenha as cinco
 * linhas sem adivinhar quais faltam, e o GNV sem referência aparece com tudo nulo em vez de sumir.
 */
const EXPECTED_PRICES = [
  {
    effectivePricePerUnit: '5.8000',
    product: 'diesel-s10',
    reference: DIESEL_REFERENCE,
    source: 'manual',
    unit: 'litre',
    updatedAt: ADJUSTED_AT.toISOString(),
  },
  {
    effectivePricePerUnit: '5.9870',
    product: 'diesel-s500',
    reference: {
      pricePerUnit: '5.9870',
      state: COMPANY_STATE,
      weekEndingOn: REFERENCE_WEEK_ENDING_ON,
    },
    source: 'anp',
    unit: 'litre',
    updatedAt: null,
  },
  {
    effectivePricePerUnit: '6.4410',
    product: 'gasolina-comum',
    reference: {
      pricePerUnit: '6.4410',
      state: COMPANY_STATE,
      weekEndingOn: REFERENCE_WEEK_ENDING_ON,
    },
    source: 'anp',
    unit: 'litre',
    updatedAt: null,
  },
  {
    effectivePricePerUnit: '4.2100',
    product: 'etanol-hidratado',
    reference: {
      pricePerUnit: '4.2100',
      state: COMPANY_STATE,
      weekEndingOn: REFERENCE_WEEK_ENDING_ON,
    },
    source: 'anp',
    unit: 'litre',
    updatedAt: null,
  },
  {
    effectivePricePerUnit: null,
    product: 'gnv',
    reference: null,
    source: null,
    unit: 'cubic-metre',
    updatedAt: null,
  },
] as const

describe('GET /company-settings/fuel-prices HTTP contract', () => {
  test('answers the five catalog products in order, with unit, source, reference and timestamp', async () => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(listPricesRequest({ origin: FRONTEND_ORIGIN }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: EXPECTED_PRICES })
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.listCalls).toEqual([COMPANY_ID])
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
    expect(fixture.logs).toContainEqual(
      expect.objectContaining({ pathname: FUEL_PRICES_PATH, status: 200 }),
    )
  })

  test('keeps answering the five products when the company has no price at all', async () => {
    const fixture = await createFuelPriceHttpFixture({ adjustments: [], references: [] })

    const response = await fixture.handle(listPricesRequest())
    const body = (await response.json()) as { readonly data: readonly { product: string }[] }

    expect(response.status).toBe(200)
    expect(body.data.map((entry) => entry.product)).toEqual([
      'diesel-s10',
      'diesel-s500',
      'gasolina-comum',
      'etanol-hidratado',
      'gnv',
    ])
    expect(body.data).toEqual(
      body.data.map((entry) => ({
        ...entry,
        effectivePricePerUnit: null,
        reference: null,
        source: null,
        updatedAt: null,
      })),
    )
  })
})

describe('PUT /company-settings/fuel-prices/{product} HTTP contract', () => {
  test('overrides one product and answers it as manual, keeping the ANP reference beside it', async () => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(
      adjustPriceRequest({ body: { pricePerUnit: '6.5000' }, product: 'diesel-s10' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        effectivePricePerUnit: '6.5000',
        product: 'diesel-s10',
        reference: DIESEL_REFERENCE,
        source: 'manual',
        unit: 'litre',
        updatedAt: ADJUSTED_AT.toISOString(),
      },
    })
    expect(fixture.adjustCalls).toEqual([
      { companyId: COMPANY_ID, pricePerUnit: '6.5000', product: 'diesel-s10' },
    ])
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
  })

  // Sobrescrever o diesel não pode mover o etanol: a decisão é por produto
  test('leaves the other four products untouched', async () => {
    const fixture = await createFuelPriceHttpFixture()

    await fixture.handle(adjustPriceRequest({ body: { pricePerUnit: '9.9900' }, product: 'gnv' }))
    const response = await fixture.handle(listPricesRequest())
    const body = (await response.json()) as { readonly data: readonly unknown[] }

    expect(body.data.slice(0, 4)).toEqual(EXPECTED_PRICES.slice(0, 4))
    expect(body.data[4]).toEqual({
      effectivePricePerUnit: '9.9900',
      product: 'gnv',
      reference: null,
      source: 'manual',
      unit: 'cubic-metre',
      updatedAt: ADJUSTED_AT.toISOString(),
    })
  })

  test.each([
    ['6.12345', 'a price beyond the fourth decimal place'],
    ['6,5000', 'a comma where the decimal point belongs'],
    ['abc', 'anything that is not a decimal at all'],
  ])('refuses %s — %s', async (pricePerUnit) => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(
      adjustPriceRequest({ body: { pricePerUnit }, product: 'diesel-s10' }),
    )

    expect(response.status).toBe(400)
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'INVALID_REQUEST',
    )
    expect(fixture.adjustCalls).toHaveLength(0)
  })

  test.each([
    [{}, 'the price is missing'],
    [{ pricePerUnit: '6.5000', source: 'manual' }, 'an unknown field rides along'],
    [{ pricePerUnit: 6.5 }, 'the price arrives as a binary float'],
  ])('refuses the body when %o — %s', async (body) => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(adjustPriceRequest({ body, product: 'diesel-s10' }))

    expect(response.status).toBe(400)
    expect(fixture.adjustCalls).toHaveLength(0)
  })

  test('refuses a product outside the catalog before touching the use case', async () => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(
      adjustPriceRequest({ body: { pricePerUnit: '6.5000' }, product: 'glp' }),
    )

    expect(response.status).toBe(400)
    expect(fixture.adjustCalls).toHaveLength(0)
  })
})

describe('DELETE /company-settings/fuel-prices/{product} HTTP contract', () => {
  test('drops the override, answers 204 without a body and sends that product back to the ANP', async () => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(clearPriceRequest('diesel-s10'))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.clearCalls).toEqual([{ companyId: COMPANY_ID, product: 'diesel-s10' }])

    const listed = (await (await fixture.handle(listPricesRequest())).json()) as {
      readonly data: readonly unknown[]
    }

    expect(listed.data[0]).toEqual({
      effectivePricePerUnit: '6.1230',
      product: 'diesel-s10',
      reference: DIESEL_REFERENCE,
      source: 'anp',
      unit: 'litre',
      updatedAt: null,
    })
    expect(listed.data.slice(1)).toEqual(EXPECTED_PRICES.slice(1))
  })

  test('refuses a product outside the catalog before touching the use case', async () => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(clearPriceRequest('glp'))

    expect(response.status).toBe(400)
    expect(fixture.clearCalls).toHaveLength(0)
  })
})

describe('/company-settings/fuel-prices security and CORS contract', () => {
  test.each(['list', 'adjust', 'clear'])(
    'requires settings.manage before the %s use case runs',
    async (operation) => {
      const fixture = await createFuelPriceHttpFixture({ permissions: new Set(['invoices.read']) })

      const response = await fixture.handle(requestFor(operation))

      expect(response.status).toBe(403)
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe('FORBIDDEN')
      expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
      expect(fixture.adjustCalls).toHaveLength(0)
      expect(fixture.clearCalls).toHaveLength(0)
      expect(fixture.listCalls).toHaveLength(0)
      expect(response.headers.get('cache-control')).toBe('no-store')
    },
  )

  test('allows the collection preflight so the browser can read the prices', async () => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(
      preflightRequest({ headers: 'Authorization', method: 'GET' }),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe('GET')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(fixture.events).toEqual([])
  })

  // O segmento do produto é slug, não UUID: sem o formato bruto na rota o preflight nem casa
  test.each([
    ['PUT', 'Authorization, Content-Type, Idempotency-Key'],
    ['DELETE', 'Authorization'],
  ])('allows the %s preflight on the product path', async (method, headers) => {
    const fixture = await createFuelPriceHttpFixture()

    const response = await fixture.handle(
      preflightRequest({ headers, method, pathname: `${FUEL_PRICES_PATH}/diesel-s10` }),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe('PUT, DELETE')
    expect(response.headers.get('access-control-allow-headers')).toBe(headers)
    expect(fixture.events).toEqual([])
  })

  test('reduces an unexpected failure to a safe no-store 500', async () => {
    const fixture = await createFuelPriceHttpFixture({
      listError: new Error('postgresql://user:password@private/tenant'),
    })

    const response = await fixture.handle(listPricesRequest())
    const serialized = await response.text()

    expect(response.status).toBe(500)
    expect(JSON.parse(serialized).error.code).toBe('INTERNAL_ERROR')
    expect(serialized).not.toContain('password')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})

function requestFor(operation: string): Request {
  if (operation === 'adjust') {
    return adjustPriceRequest({ body: { pricePerUnit: '6.5000' }, product: 'diesel-s10' })
  }
  return operation === 'clear' ? clearPriceRequest('diesel-s10') : listPricesRequest()
}

type PreflightRequestParams = {
  readonly headers: string
  readonly method: string
  readonly pathname?: string
}

function preflightRequest({
  headers,
  method,
  pathname = FUEL_PRICES_PATH,
}: PreflightRequestParams): Request {
  return new Request(`http://localhost${pathname}`, {
    headers: {
      origin: FRONTEND_ORIGIN,
      'access-control-request-headers': headers,
      'access-control-request-method': method,
    },
    method: 'OPTIONS',
  })
}
