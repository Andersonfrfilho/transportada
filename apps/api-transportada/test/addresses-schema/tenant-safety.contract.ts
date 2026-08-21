/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, test } from 'bun:test'

import type { PostalCodeAddressRow } from '../../src/addresses/domain/postal-code-suggestion.policy.js'
import {
  POSTAL_CODE_ORIGINS,
  raceCompleteSuggestion,
} from '../../src/addresses/infrastructure/drizzle-postal-code.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000902'
const POSTAL_CODE = '14020210'

const dialect = new PgDialect()

const toSql = (filters: readonly Parameters<typeof and>[number][]) =>
  dialect.sqlToQuery(and(...filters)!)

const originByName = (name: string) => {
  const origin = POSTAL_CODE_ORIGINS.find((candidate) => candidate.name === name)
  if (origin === undefined) throw new Error(`Unknown postal code origin ${name}`)
  return origin
}

const row = (overrides: Partial<PostalCodeAddressRow>): PostalCodeAddressRow => ({
  city: '',
  district: '',
  recordedAt: new Date('2026-08-01T00:00:00.000Z'),
  state: '',
  street: '',
  ...overrides,
})

const COMPLETE_ROW = row({
  city: 'Guaíra',
  district: 'Centro',
  state: 'SP',
  street: 'Rua Sete',
})

const PARTIAL_ROW = row({ state: 'SP' })

const resolvedAfter = (
  rows: readonly PostalCodeAddressRow[],
  ticks: number,
): (() => Promise<readonly PostalCodeAddressRow[]>) => {
  return async () => {
    for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve()
    return rows
  }
}

const never = (): Promise<readonly PostalCodeAddressRow[]> => new Promise(() => {})

describe('postal code directory tenant safety', () => {
  test('covers every address origin that can answer a postal code', () => {
    expect(POSTAL_CODE_ORIGINS.map((origin) => origin.name)).toEqual([
      'nfeAddress',
      'companyFiscalProfile',
      'fleetDriver',
      'mdfeLoading',
      'mdfeDischarge',
    ])
  })

  test('scopes the nota address lookup by company and postal code', () => {
    const query = toSql(
      originByName('nfeAddress').buildFilters({ companyId: COMPANY_ID, postalCode: POSTAL_CODE }),
    )

    expect(query.sql).toContain('"nfe_addresses"."company_id" = $')
    expect(query.sql).toContain('"nfe_addresses"."postal_code" = $')
    expect(query.params).toEqual([COMPANY_ID, POSTAL_CODE])
  })

  test('scopes the fiscal profile lookup by company and postal code', () => {
    const query = toSql(
      originByName('companyFiscalProfile').buildFilters({
        companyId: COMPANY_ID,
        postalCode: POSTAL_CODE,
      }),
    )

    expect(query.sql).toContain('"company_fiscal_profiles"."company_id" = $')
    expect(query.sql).toContain('"company_fiscal_profiles"."postal_code" = $')
    expect(query.params).toEqual([COMPANY_ID, POSTAL_CODE])
  })

  test('scopes the driver lookup by company and postal code', () => {
    const query = toSql(
      originByName('fleetDriver').buildFilters({ companyId: COMPANY_ID, postalCode: POSTAL_CODE }),
    )

    expect(query.sql).toContain('"fleet_drivers"."company_id" = $')
    expect(query.sql).toContain('"fleet_drivers"."postal_code" = $')
    expect(query.params).toEqual([COMPANY_ID, POSTAL_CODE])
  })

  test('scopes both manifest lookups by company, each on its own postal code column', () => {
    const loading = toSql(
      originByName('mdfeLoading').buildFilters({ companyId: COMPANY_ID, postalCode: POSTAL_CODE }),
    )
    const discharge = toSql(
      originByName('mdfeDischarge').buildFilters({
        companyId: COMPANY_ID,
        postalCode: POSTAL_CODE,
      }),
    )

    expect(loading.sql).toContain('"mdfe_manifests"."company_id" = $')
    expect(loading.sql).toContain('"mdfe_manifests"."loading_postal_code" = $')
    expect(discharge.sql).toContain('"mdfe_manifests"."company_id" = $')
    expect(discharge.sql).toContain('"mdfe_manifests"."discharge_postal_code" = $')
    expect(loading.params).toEqual([COMPANY_ID, POSTAL_CODE])
    expect(discharge.params).toEqual([COMPANY_ID, POSTAL_CODE])
  })

  /** O mesmo CEP gravado em duas empresas: a consulta muda de dono, nunca de recorte. */
  test('never lets one company read the postal code recorded by another', () => {
    for (const origin of POSTAL_CODE_ORIGINS) {
      const owner = toSql(origin.buildFilters({ companyId: COMPANY_ID, postalCode: POSTAL_CODE }))
      const intruder = toSql(
        origin.buildFilters({ companyId: OTHER_COMPANY_ID, postalCode: POSTAL_CODE }),
      )

      expect(owner.sql).toBe(intruder.sql)
      expect(owner.params).toEqual([COMPANY_ID, POSTAL_CODE])
      expect(intruder.params).toEqual([OTHER_COMPANY_ID, POSTAL_CODE])
    }
  })
})

describe('postal code origin race', () => {
  test('answers with the complete suggestion even when a partial origin responds first', async () => {
    const suggestion = await raceCompleteSuggestion([
      resolvedAfter([PARTIAL_ROW], 0),
      resolvedAfter([COMPLETE_ROW], 4),
    ])

    expect(suggestion).toEqual({
      city: 'Guaíra',
      district: 'Centro',
      state: 'SP',
      street: 'Rua Sete',
    })
  })

  /** É por isto que `Promise.race` cru não serve: a origem mais rápida costuma ser a que nada achou. */
  test('does not wait for the slow origins once a complete suggestion arrives', async () => {
    const suggestion = await raceCompleteSuggestion([
      never,
      resolvedAfter([], 0),
      resolvedAfter([COMPLETE_ROW], 1),
    ])

    expect(suggestion?.street).toBe('Rua Sete')
  })

  test('falls back to the best partial when no origin answers completely', async () => {
    const suggestion = await raceCompleteSuggestion([
      resolvedAfter([], 0),
      resolvedAfter([PARTIAL_ROW], 2),
      resolvedAfter([row({ city: 'Guaíra', state: 'SP' })], 1),
    ])

    expect(suggestion).toEqual({ city: 'Guaíra', district: '', state: 'SP', street: '' })
  })

  test('answers nothing when no origin has the postal code', async () => {
    expect(await raceCompleteSuggestion([resolvedAfter([], 0), resolvedAfter([], 1)])).toBeNull()
    expect(await raceCompleteSuggestion([])).toBeNull()
  })

  /** Consulta que falha é defeito, não ausência de endereço: ela sobe para a fronteira. */
  test('propagates a failing origin instead of reporting an empty postal code', async () => {
    const failure = raceCompleteSuggestion([
      resolvedAfter([], 0),
      () => Promise.reject(new Error('POSTAL_CODE_ORIGIN_UNAVAILABLE')),
    ])

    await expect(failure).rejects.toThrow('POSTAL_CODE_ORIGIN_UNAVAILABLE')
  })
})
