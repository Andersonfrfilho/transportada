/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097 D7 contra o Postgres: a montagem lê o barracão pela mesma regra que o solver — a origem
 * configurada, ou o endereço cadastrado da empresa quando não há.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createRouteDepotQuery } from '../../src/trips/infrastructure/route-depot.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
const depots = createRouteDepotQuery(provider.db)

/** CEP que nenhuma outra suíte usa: a chave de `geocoded_addresses` é global, não por empresa. */
const COMPANY_KEY = '3543402|14076988|2296'
const CONFIGURED_KEY = 'galpao-097-d7-api'

describeDatabase('o barracão da montagem (spec 097 D7)', () => {
  const fallbackCompanyId = crypto.randomUUID()
  const lastStopCompanyId = crypto.randomUUID()
  const configuredCompanyId = crypto.randomUUID()
  const bareCompanyId = crypto.randomUUID()
  const companyIds = [fallbackCompanyId, lastStopCompanyId, configuredCompanyId, bareCompanyId]

  beforeAll(async () => {
    for (const companyId of companyIds) {
      await provider.db.execute(
        sql`insert into companies (id, status) values (${companyId}, 'active')`,
      )
    }
    for (const companyId of [fallbackCompanyId, lastStopCompanyId, configuredCompanyId]) {
      await provider.db.execute(sql`
        insert into company_fiscal_profiles
          (company_id, legal_name, trade_name, cnpj, state_registration, municipal_registration,
           tax_regime, rntrc, street, number, complement, district, city, state, postal_code,
           city_ibge_code, phone, email)
        values (${companyId}, 'Transportadora D7', 'D7', ${companyId.replace(/\D/gu, '').slice(0, 14).padEnd(14, '0')}, '', '', '1', '58151044',
          'Rua do Galpão', '2296', '', 'Centro', 'Ribeirão Preto', 'SP', '14076-988', '3543402',
          '1600000000', 'fiscal@example.test')
      `)
    }
    await provider.db.execute(sql`
      insert into company_route_optimization_settings
        (company_id, origin_address_key, end_policy, timezone)
      values (${lastStopCompanyId}, '', 'last_stop', 'America/Sao_Paulo'),
        (${configuredCompanyId}, ${CONFIGURED_KEY}, 'depot', 'America/Sao_Paulo')
    `)
    await provider.db.execute(sql`
      insert into geocoded_addresses
        (address_key, latitude, longitude, precision, source, external_place_id)
      values (${CONFIGURED_KEY}, '-21.1767000', '-47.8208000', 'rooftop', 'manual', '')
      on conflict (address_key) do nothing
    `)
  })

  afterAll(async () => {
    for (const companyId of companyIds) {
      await provider.db.execute(
        sql`delete from company_route_optimization_settings where company_id = ${companyId}`,
      )
      await provider.db.execute(
        sql`delete from company_fiscal_profiles where company_id = ${companyId}`,
      )
      await provider.db.execute(sql`delete from companies where id = ${companyId}`)
    }
    await provider.db.execute(
      sql`delete from geocoded_addresses where address_key in (${COMPANY_KEY}, ${CONFIGURED_KEY})`,
    )
    await provider.close()
  })

  test('sem perfil nem configuração, o barracão não está cadastrado', async () => {
    expect(await depots.readDepot({ companyId: bareCompanyId })).toEqual({
      reason: 'not_configured',
      status: 'absent',
    })
  })

  test('o endereço da empresa sem coordenada avisa, e diz de onde veio', async () => {
    expect(await depots.readDepot({ companyId: fallbackCompanyId })).toEqual({
      originSource: 'company_address',
      reason: 'not_geocoded',
      status: 'absent',
    })
  })

  test('geocodificado, a rota parte do endereço da empresa e volta pela política padrão', async () => {
    await provider.db.execute(sql`
      insert into geocoded_addresses
        (address_key, latitude, longitude, precision, source, external_place_id)
      values (${COMPANY_KEY}, '-21.1800000', '-47.8100000', 'postal_code', 'postal_code', '')
      on conflict (address_key) do nothing
    `)
    const point = { latitude: -21.18, longitude: -47.81 }

    expect(await depots.readDepot({ companyId: fallbackCompanyId })).toEqual({
      end: point,
      origin: point,
      originSource: 'company_address',
      status: 'resolved',
    })
    /** A linha com origem vazia ainda manda na política de fim. */
    expect(await depots.readDepot({ companyId: lastStopCompanyId })).toEqual({
      end: null,
      origin: point,
      originSource: 'company_address',
      status: 'resolved',
    })
  })

  test('a origem configurada vence o endereço da empresa', async () => {
    const depot = await depots.readDepot({ companyId: configuredCompanyId })

    expect(depot).toMatchObject({ originSource: 'route_settings', status: 'resolved' })
    expect(depot.status === 'resolved' ? depot.origin : null).toEqual({
      latitude: -21.1767,
      longitude: -47.8208,
    })
  })
})
