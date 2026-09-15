/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097 D7 contra o Postgres: sem origem configurada, o solver parte do endereço cadastrado da
 * empresa, e é a mesma rotina que adianta a coordenada das paradas que o geocodifica.
 *
 * Staging, 2026-09-15: `company_route_optimization_settings` com zero linhas, endereço fiscal
 * completo, e a chave dele ausente de `geocoded_addresses` — "Propor ordem" partia de lugar nenhum.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createDrizzlePendingAddressSource } from '../src/geocoding-backfill/infrastructure/drizzle-pending-address.repository.js'
import { buildStopAddressKey } from '../src/routing/domain/pool-address-key.js'
import { createDrizzleRouteOptimizationRepository } from '../src/routing/infrastructure/drizzle-route-optimization.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
const db = provider.db

/** CEP de oito dígitos que nenhuma outra suíte usa, para a fila não misturar endereços. */
const COMPANY_KEY = '3543402|14076977|2296'
const CONFIGURED_KEY = 'galpao-097-d7'

describeDatabase('o barracão vem do cadastro da empresa (spec 097 D7)', () => {
  const fallbackCompanyId = crypto.randomUUID()
  const configuredCompanyId = crypto.randomUUID()
  const fallbackSuggestionId = crypto.randomUUID()
  const configuredSuggestionId = crypto.randomUUID()
  const repository = createDrizzleRouteOptimizationRepository(db)
  const pending = createDrizzlePendingAddressSource(db)

  beforeAll(async () => {
    for (const companyId of [fallbackCompanyId, configuredCompanyId]) {
      await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
      await db.execute(sql`
        insert into company_fiscal_profiles
          (company_id, legal_name, trade_name, cnpj, state_registration, municipal_registration,
           tax_regime, rntrc, street, number, complement, district, city, state, postal_code,
           city_ibge_code, phone, email)
        values (${companyId}, 'Transportadora D7', 'D7', ${companyId.replace(/\D/gu, '').slice(0, 14).padEnd(14, '0')}, '', '', '1', '58151044',
          'Rua do Galpão', '2296', '', 'Centro', 'Ribeirão Preto', 'SP', '14076-977', '3543402',
          '1600000000', 'fiscal@example.test')
      `)
    }
    await db.execute(sql`
      insert into company_route_optimization_settings (company_id, origin_address_key, timezone)
      values (${configuredCompanyId}, ${CONFIGURED_KEY}, 'America/Sao_Paulo')
    `)
    await db.execute(sql`
      insert into geocoded_addresses
        (address_key, latitude, longitude, precision, source, external_place_id)
      values (${CONFIGURED_KEY}, '-21.1767000', '-47.8208000', 'rooftop', 'manual', '')
      on conflict (address_key) do nothing
    `)
    for (const [companyId, suggestionId] of [
      [fallbackCompanyId, fallbackSuggestionId],
      [configuredCompanyId, configuredSuggestionId],
    ] as const) {
      await db.execute(sql`
        insert into route_suggestions (id, company_id, trip_id, status, seed, assumptions)
        values (${suggestionId}, ${companyId}, null, 'queued', 7, '{}'::jsonb)
      `)
    }
  })

  afterAll(async () => {
    const companyIds = [fallbackCompanyId, configuredCompanyId]
    for (const companyId of companyIds) {
      await db.execute(sql`delete from route_suggestions where company_id = ${companyId}`)
      await db.execute(
        sql`delete from company_route_optimization_settings where company_id = ${companyId}`,
      )
      await db.execute(sql`delete from company_fiscal_profiles where company_id = ${companyId}`)
      await db.execute(sql`delete from companies where id = ${companyId}`)
    }
    await db.execute(
      sql`delete from geocoded_addresses where address_key in (${COMPANY_KEY}, ${CONFIGURED_KEY})`,
    )
    await provider.close()
  })

  test('o endereço da empresa entra na fila da geocodificação em lote, uma vez só', async () => {
    const page = await pending.list({ after: '3543402|14076976', limit: 50 })

    expect(page.filter((address) => address.addressKey === COMPANY_KEY)).toEqual([
      { addressKey: COMPANY_KEY, cityCode: '3543402', postalCode: '14076977' },
    ])
  })

  test('sem coordenada, o solver fica sem barracão — nada inventado (D2)', async () => {
    const context = await repository.readContext({
      companyId: fallbackCompanyId,
      correlationId: 'depot-d7',
      suggestionId: fallbackSuggestionId,
    })

    expect(context?.depot).toBeNull()
  })

  test('geocodificado, o solver parte do endereço da empresa e volta para ele', async () => {
    await db.execute(sql`
      insert into geocoded_addresses
        (address_key, latitude, longitude, precision, source, external_place_id)
      values (${COMPANY_KEY}, '-21.1800000', '-47.8100000', 'postal_code', 'postal_code', '')
      on conflict (address_key) do nothing
    `)

    const context = await repository.readContext({
      companyId: fallbackCompanyId,
      correlationId: 'depot-d7',
      suggestionId: fallbackSuggestionId,
    })
    const page = await pending.list({ after: '3543402|14076976', limit: 50 })

    expect(context?.depot).toEqual({
      addressKey: COMPANY_KEY,
      latitude: '-21.1800000',
      longitude: '-47.8100000',
    })
    expect(context?.end).toEqual(context?.depot ?? null)
    expect(page.some((address) => address.addressKey === COMPANY_KEY)).toBe(false)
  })

  /** A chave enfileirada tem de ser a que o solver procura, com o número em qualquer grafia. */
  test('a fila monta a mesma chave que buildStopAddressKey', async () => {
    const cases = ['nº 45', 'SN', 'Sem número', '12  a', ' N° 7 ']
    const ids = cases.map(() => crypto.randomUUID())
    const postalCodeOf = (index: number) => `1407699${index}`
    try {
      for (const [index, number] of cases.entries()) {
        const companyId = ids[index] ?? ''
        await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
        await db.execute(sql`
          insert into company_fiscal_profiles
            (company_id, legal_name, trade_name, cnpj, state_registration, municipal_registration,
             tax_regime, rntrc, street, number, complement, district, city, state, postal_code,
             city_ibge_code, phone, email)
          values (${companyId}, 'D7', 'D7', ${companyId.replace(/\D/gu, '').slice(0, 14).padEnd(14, '0')},
            '', '', '1', '58151044', 'Rua', ${number}, '', 'Centro', 'Ribeirão Preto', 'SP',
            ${postalCodeOf(index)}, ' 3543402 ', '1600000000', 'fiscal@example.test')
        `)
      }
      const page = await pending.list({ after: '3543402|14076989', limit: 50 })

      for (const [index, number] of cases.entries()) {
        const expected = buildStopAddressKey({
          cityCode: ' 3543402 ',
          number,
          postalCode: postalCodeOf(index),
        })
        expect(page.map((address) => address.addressKey)).toContain(expected ?? 'sem chave')
      }
    } finally {
      for (const companyId of ids) {
        await db.execute(sql`delete from company_fiscal_profiles where company_id = ${companyId}`)
        await db.execute(sql`delete from companies where id = ${companyId}`)
      }
    }
  })

  test('a origem configurada vence o endereço da empresa', async () => {
    const context = await repository.readContext({
      companyId: configuredCompanyId,
      correlationId: 'depot-d7',
      suggestionId: configuredSuggestionId,
    })

    expect(context?.depot?.addressKey).toBe(CONFIGURED_KEY)
  })
})
