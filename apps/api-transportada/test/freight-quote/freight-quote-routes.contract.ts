/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  FreightQuoteSettingsAuditEntry,
  FreightQuoteSettingsPort,
  FreightQuoteSettingsRecord,
} from '../../src/freight-quote/application/freight-quote-settings.port.js'
import {
  createCalculateFreightQuoteUseCase,
  createClearFreightQuoteSettingsUseCase,
  createGetFreightQuoteSettingsUseCase,
  createSetFreightQuoteSettingsUseCase,
} from '../../src/freight-quote/application/freight-quote.use-case.js'
import { FREIGHT_QUOTE_DEFAULTS } from '../../src/freight-quote/domain/freight-quote-defaults.constant.js'
import { createFreightQuoteRoutes } from '../../src/freight-quote/presentation/freight-quote.routes.js'
import {
  API_FREIGHT_QUOTE_SETTINGS_PATH,
  API_FREIGHT_QUOTES_PATH,
} from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import type { FuelPricePort } from '../../src/companies/application/fuel-price.port.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'

function fakeSettings(initial: FreightQuoteSettingsRecord | null) {
  let stored = initial
  const audits: FreightQuoteSettingsAuditEntry[] = []
  const companies: string[] = []
  const port: FreightQuoteSettingsPort = {
    appendAudit: async (entry) => {
      audits.push(entry)
    },
    find: async ({ companyId }) => {
      companies.push(companyId)
      return stored
    },
    remove: async () => {
      stored = null
    },
    upsert: async (input) => {
      companies.push(input.companyId)
      stored = { updatedAt: new Date('2026-11-15T12:00:00Z'), values: input.values }
      return stored
    },
  }
  return { audits, companies, port }
}

function fuelPrices(dieselS10: string | null): FuelPricePort {
  return {
    loadFacts: async () => ({
      adjustments:
        dieselS10 === null
          ? []
          : [{ pricePerUnit: dieselS10, product: 'diesel-s10', updatedAt: new Date() }],
      energy: null,
      references: [],
      state: 'SP',
    }),
  } as unknown as FuelPricePort
}

function routes(port: FreightQuoteSettingsPort, diesel: string | null) {
  return createFreightQuoteRoutes({
    calculate: createCalculateFreightQuoteUseCase({
      fuelPrices: fuelPrices(diesel),
      settings: port,
    }),
    clear: createClearFreightQuoteSettingsUseCase({ settings: port }),
    get: createGetFreightQuoteSettingsUseCase({ settings: port }),
    set: createSetFreightQuoteSettingsUseCase({ settings: port }),
  })
}

function call(
  port: FreightQuoteSettingsPort,
  diesel: string | null,
  method: 'DELETE' | 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<Response> {
  const route = routes(port, diesel).find(
    (candidate) => candidate.method === method && candidate.pathname === path,
  )
  if (route === undefined) throw new Error(`missing ${method} ${path}`)
  return route.execute({
    context: {
      identity: undefined,
      scope: {
        companyId: COMPANY_ID,
        kind: 'company',
        membershipId: '44444444-4444-4444-8444-444444444444',
        permissions: new Set(['settings.manage', 'freight.simulate']),
        roles: ['company-admin'],
        userId: USER_ID,
      },
    } as never,
    correlationId: 'freight-quote-contract',
    pathParameters: {},
    request: new Request(`http://api.test${path}`, {
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      method,
    }),
  })
}

type QuoteData = {
  readonly anttFloor: {
    readonly cargoTypes: readonly unknown[]
    readonly source: { readonly resolution: string }
  }
  readonly fuelPriceOrigin: string
  readonly origin: string
  readonly settingsOrigin: string
  readonly totalAmount: string
  readonly values: { readonly marginPercent: string }
}

const VALID_QUOTE = { axles: 5, cargoType: 5, cargoValue: '100000', distanceKm: '500' }

describe('freight quote routes (spec 326)', () => {
  test('without a row, GET answers the system defaults, the ANTT source and no 404', async () => {
    const { port } = fakeSettings(null)
    const response = await call(port, null, 'GET', API_FREIGHT_QUOTE_SETTINGS_PATH)
    expect(response.status).toBe(200)
    const { data } = (await response.json()) as { data: QuoteData }
    expect(data.origin).toBe('default')
    expect(data.values.marginPercent).toBe(FREIGHT_QUOTE_DEFAULTS.marginPercent)
    expect(data.anttFloor.source.resolution).toContain('6.084/2026')
    expect(data.anttFloor.cargoTypes.length).toBe(12)
  })

  test('PUT saves for the company in context and leaves an audit trail', async () => {
    const { audits, companies, port } = fakeSettings(null)
    const response = await call(port, null, 'PUT', API_FREIGHT_QUOTE_SETTINGS_PATH, {
      ...FREIGHT_QUOTE_DEFAULTS,
      marginPercent: '20.0000',
    })
    expect(response.status).toBe(200)
    expect(new Set(companies)).toEqual(new Set([COMPANY_ID]))
    expect(audits.length).toBe(1)
    expect(audits[0]?.before).toBeNull()
    expect(audits[0]?.after?.marginPercent).toBe('20.0000')
  })

  test('PUT refuses a company id in the body and a margin of 100', async () => {
    const { port } = fakeSettings(null)
    await expect(
      call(port, null, 'PUT', API_FREIGHT_QUOTE_SETTINGS_PATH, {
        ...FREIGHT_QUOTE_DEFAULTS,
        companyId: COMPANY_ID,
      }),
    ).rejects.toBeInstanceOf(ApiError)
    await expect(
      call(port, null, 'PUT', API_FREIGHT_QUOTE_SETTINGS_PATH, {
        ...FREIGHT_QUOTE_DEFAULTS,
        marginPercent: '100',
      }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  test('DELETE returns to the defaults and records it only when a row existed', async () => {
    const empty = fakeSettings(null)
    expect((await call(empty.port, null, 'DELETE', API_FREIGHT_QUOTE_SETTINGS_PATH)).status).toBe(
      204,
    )
    expect(empty.audits.length).toBe(0)

    const filled = fakeSettings({ updatedAt: new Date(), values: { ...FREIGHT_QUOTE_DEFAULTS } })
    expect((await call(filled.port, null, 'DELETE', API_FREIGHT_QUOTE_SETTINGS_PATH)).status).toBe(
      204,
    )
    expect(filled.audits.length).toBe(1)
  })

  test('POST quotes with the company diesel price and does not write anything', async () => {
    const { audits, port } = fakeSettings(null)
    const response = await call(port, '6.0000', 'POST', API_FREIGHT_QUOTES_PATH, VALID_QUOTE)
    expect(response.status).toBe(200)
    const { data } = (await response.json()) as { data: QuoteData }
    expect(data.totalAmount).toBe('4493.4600')
    expect(data.fuelPriceOrigin).toBe('company-or-anp')
    expect(data.settingsOrigin).toBe('default')
    expect(audits.length).toBe(0)
  })

  test('POST with an informed diesel price needs no company price', async () => {
    const { port } = fakeSettings(null)
    const response = await call(port, null, 'POST', API_FREIGHT_QUOTES_PATH, {
      ...VALID_QUOTE,
      fuelPricePerLitre: '6.0000',
    })
    const { data } = (await response.json()) as { data: QuoteData }
    expect(data.fuelPriceOrigin).toBe('informed')
  })

  test('POST without any diesel price is a 422, not a guess', async () => {
    const { port } = fakeSettings(null)
    try {
      await call(port, null, 'POST', API_FREIGHT_QUOTES_PATH, VALID_QUOTE)
      throw new Error('expected a rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(422)
    }
  })

  test('POST refuses an unknown cargo type and extra fields', async () => {
    const { port } = fakeSettings(null)
    await expect(
      call(port, '6.0000', 'POST', API_FREIGHT_QUOTES_PATH, { ...VALID_QUOTE, cargoType: 13 }),
    ).rejects.toBeInstanceOf(ApiError)
    await expect(
      call(port, '6.0000', 'POST', API_FREIGHT_QUOTES_PATH, {
        ...VALID_QUOTE,
        companyId: COMPANY_ID,
      }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  test('reads need freight.simulate and writes need settings.manage', () => {
    const { port } = fakeSettings(null)
    const policies = routes(port, null).map((route) => `${route.method} ${route.pathname}`)
    expect(policies).toEqual([
      `GET ${API_FREIGHT_QUOTE_SETTINGS_PATH}`,
      `PUT ${API_FREIGHT_QUOTE_SETTINGS_PATH}`,
      `DELETE ${API_FREIGHT_QUOTE_SETTINGS_PATH}`,
      `POST ${API_FREIGHT_QUOTES_PATH}`,
    ])
    const permissions = routes(port, null).map(
      (route) => (route as unknown as { policy: { permission: string } }).policy.permission,
    )
    expect(permissions).toEqual([
      'freight.simulate',
      'settings.manage',
      'settings.manage',
      'freight.simulate',
    ])
  })
})
