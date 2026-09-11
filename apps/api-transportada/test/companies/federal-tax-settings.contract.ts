/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type {
  FederalTaxAuditEntry,
  FederalTaxSettings,
  FederalTaxSettingsPort,
} from '../../src/companies/application/federal-tax-settings.port.js'
import {
  createClearFederalTaxSettingsUseCase,
  createGetFederalTaxSettingsUseCase,
  createSetFederalTaxSettingsUseCase,
} from '../../src/companies/application/federal-tax-settings.use-case.js'
import { createFederalTaxSettingsRoutes } from '../../src/companies/presentation/federal-tax-settings.routes.js'
import { parseFederalTaxSettingsBody } from '../../src/companies/presentation/federal-tax-settings.schema.js'
import { API_COMPANY_SETTINGS_FEDERAL_TAXES_PATH } from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import { buildTripTaxParcels } from '../../src/trips/domain/trip-tax.policy.js'

/**
 * Spec 126 — **o regime federal se declara em Configurações.** `company_tax_settings` existia sem
 * rota nem tela; toda viagem saía "regime federal não declarado".
 */
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const UPDATED_AT = new Date('2026-09-10T12:00:00.000Z')

function body(value: unknown): Request {
  return new Request('http://api.test/company-settings/federal-taxes', {
    body: JSON.stringify(value),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

async function rejection(value: unknown): Promise<ApiError> {
  try {
    await parseFederalTaxSettingsBody(body(value))
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected a rejection')
}

function fakePort(initial: FederalTaxSettings | null) {
  let stored = initial
  const audits: FederalTaxAuditEntry[] = []
  const writes: string[] = []
  const port: FederalTaxSettingsPort = {
    appendAudit: async (entry) => {
      audits.push(entry)
    },
    find: async ({ companyId }) => {
      writes.push(`find:${companyId}`)
      return stored
    },
    remove: async ({ companyId }) => {
      writes.push(`remove:${companyId}`)
      stored = null
    },
    upsert: async (input) => {
      writes.push(`upsert:${input.companyId}:${input.updatedByUserId}`)
      stored = {
        cofinsRate: input.cofinsRate,
        federalRegime: input.federalRegime,
        pisRate: input.pisRate,
        updatedAt: UPDATED_AT,
      }
      return stored
    },
  }

  return { audits, port, writes }
}

describe('federal tax settings (spec 126)', () => {
  test('the body is a fraction per regime', async () => {
    expect(
      await parseFederalTaxSettingsBody(
        body({ cofinsRate: '0.03', federalRegime: 'presumed', pisRate: '0.0065' }),
      ),
    ).toEqual({ cofinsRate: '0.03', federalRegime: 'presumed', pisRate: '0.0065' })
  })

  /** Regra 2: `0.65` é o percentual digitado onde se espera a fração — 65% de imposto. */
  test('a percentage typed as fraction is refused, with every field at once', async () => {
    const error = await rejection({ cofinsRate: '3', federalRegime: 'presumed', pisRate: '0.65' })

    expect(error.status).toBe(422)
    expect(error.code).toBe('COMPANY_FEDERAL_TAX_RATE_OUT_OF_RANGE')
    expect(error.details?.map((detail) => detail.field)).toEqual(['cofinsRate', 'pisRate'])
  })

  /** Regra 3: no Simples os dois estão dentro do DAS — não há alíquota própria a descontar. */
  test('the simple regime only accepts zero', async () => {
    const error = await rejection({ cofinsRate: '0.03', federalRegime: 'simple', pisRate: '0' })

    expect(error.code).toBe('COMPANY_FEDERAL_TAX_SIMPLE_NOT_ZERO')
    expect(
      await parseFederalTaxSettingsBody(
        body({ cofinsRate: '0', federalRegime: 'simple', pisRate: '0' }),
      ),
    ).toMatchObject({ federalRegime: 'simple' })
  })

  test('unknown regime, extra keys and the company in the body are refused', async () => {
    expect((await rejection({ cofinsRate: '0', federalRegime: 'mei', pisRate: '0' })).status).toBe(
      400,
    )
    expect(
      (
        await rejection({
          cofinsRate: '0',
          companyId: OTHER_COMPANY_ID,
          federalRegime: 'simple',
          pisRate: '0',
        })
      ).status,
    ).toBe(400)
  })

  test('saving writes for the context company and audits before and after', async () => {
    const { audits, port, writes } = fakePort(null)
    const saved = await createSetFederalTaxSettingsUseCase({ settings: port }).execute({
      cofinsRate: '0.076',
      companyId: COMPANY_ID,
      correlationId: 'corr-1',
      federalRegime: 'real',
      pisRate: '0.0165',
      userId: USER_ID,
    })

    expect(saved.federalRegime).toBe('real')
    expect(writes).toContain(`upsert:${COMPANY_ID}:${USER_ID}`)
    expect(audits).toEqual([
      {
        action: 'company-federal-tax.saved',
        actorUserId: USER_ID,
        after: { cofinsRate: '0.076', federalRegime: 'real', pisRate: '0.0165' },
        before: null,
        companyId: COMPANY_ID,
        correlationId: 'corr-1',
      },
    ])
  })

  test('clearing removes the row and audits only what existed', async () => {
    const existing = fakePort({
      cofinsRate: '0.03',
      federalRegime: 'presumed',
      pisRate: '0.0065',
      updatedAt: UPDATED_AT,
    })
    await createClearFederalTaxSettingsUseCase({ settings: existing.port }).execute({
      companyId: COMPANY_ID,
      correlationId: 'corr-2',
      userId: USER_ID,
    })
    expect(existing.writes).toContain(`remove:${COMPANY_ID}`)
    expect(existing.audits[0]?.action).toBe('company-federal-tax.cleared')

    const empty = fakePort(null)
    await createClearFederalTaxSettingsUseCase({ settings: empty.port }).execute({
      companyId: COMPANY_ID,
      correlationId: 'corr-3',
      userId: USER_ID,
    })
    expect(empty.audits).toEqual([])
  })

  test('the three routes live under settings.manage, company scope', () => {
    const { port } = fakePort(null)
    const routes = createFederalTaxSettingsRoutes({
      clear: createClearFederalTaxSettingsUseCase({ settings: port }),
      get: createGetFederalTaxSettingsUseCase({ settings: port }),
      set: createSetFederalTaxSettingsUseCase({ settings: port }),
    })

    expect(routes.map((route) => route.method)).toEqual(['GET', 'PUT', 'DELETE'])
    for (const route of routes) {
      expect(route.pathname).toBe(API_COMPANY_SETTINGS_FEDERAL_TAXES_PATH)
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
    expect(API_COMPANY_SETTINGS_FEDERAL_TAXES_PATH).toBe('/company-settings/federal-taxes')
  })

  /** A empresa vem do contexto autenticado: a rota nem lê `companyId` de outro lugar. */
  test('the routes read the company from the context only', () => {
    const routes = readFileSync(
      new URL('../../src/companies/presentation/federal-tax-settings.routes.ts', import.meta.url),
      'utf8',
    )

    expect(routes.match(/companyId: context\.scope\.companyId/g)?.length).toBe(3)
    expect(routes).not.toContain('input.companyId')
  })

  /** Isolamento: toda leitura e escrita da tabela é filtrada pelo tenant, por construção. */
  test('every repository statement is scoped by company', () => {
    const repository = readFileSync(
      new URL(
        '../../src/companies/infrastructure/drizzle-federal-tax-settings.repository.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const wheres = repository.match(/\.where\([^)]*\)/g) ?? []

    expect(wheres.length).toBeGreaterThanOrEqual(2)
    for (const where of wheres) expect(where).toContain('companyTaxSettings.companyId')
    expect(repository).toContain('target: companyTaxSettings.companyId')
    expect(repository).toContain('companyId: input.companyId')
  })

  /** Regra 6: alíquota afirmada sobre receita prevista ainda é projeção. */
  test('the federal parcel follows the revenue source', () => {
    const rates = { cofinsRate: '0.030000', pisRate: '0.006500' }
    const [, projected] = buildTripTaxParcels({
      documents: [],
      federalRates: rates,
      revenueAmount: '2000.0000',
      revenueSource: 'estimated',
    })
    const [, measured] = buildTripTaxParcels({
      documents: [],
      federalRates: rates,
      revenueAmount: '2000.0000',
      revenueSource: 'measured',
    })

    expect(projected).toMatchObject({ amount: '73.0000', source: 'estimated' })
    expect(measured).toMatchObject({ amount: '73.0000', source: 'measured' })
  })
})
