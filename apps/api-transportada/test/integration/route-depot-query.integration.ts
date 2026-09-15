/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 097 D7 contra o Postgres: a montagem lê o barracão pela mesma regra que o solver — a origem
 * configurada, ou o endereço cadastrado da empresa quando não há.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { createRouteDepotQuery } from '../../src/trips/infrastructure/route-depot.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const COMPANY_KEY = '3543402|14076988|2296'
const CONFIGURED_KEY = 'galpao-097-d7-api'

/**
 * Banco descartável com todas as migrations, como as outras suítes: no CI o banco da URL é só o
 * administrativo — sem migration nenhuma, `companies` nem existe ali.
 */
describeDatabase('o barracão da montagem (spec 097 D7)', () => {
  const fallbackCompanyId = crypto.randomUUID()
  const lastStopCompanyId = crypto.randomUUID()
  const configuredCompanyId = crypto.randomUUID()
  const bareCompanyId = crypto.randomUUID()
  const companyIds = [fallbackCompanyId, lastStopCompanyId, configuredCompanyId, bareCompanyId]
  const databaseName = `transportada_d7_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined

  function readDepots(): ReturnType<typeof createRouteDepotQuery> {
    if (database === undefined) throw new Error('A disposable database is required')
    return createRouteDepotQuery(database.db)
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    const { db } = database

    for (const companyId of companyIds) {
      await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    }
    for (const companyId of [fallbackCompanyId, lastStopCompanyId, configuredCompanyId]) {
      await db.execute(sql`
        insert into company_fiscal_profiles
          (company_id, legal_name, trade_name, cnpj, state_registration, municipal_registration,
           tax_regime, rntrc, street, number, complement, district, city, state, postal_code,
           city_ibge_code, phone, email)
        values (${companyId}, 'Transportadora D7', 'D7', ${companyId.replace(/\D/gu, '').slice(0, 14).padEnd(14, '0')}, '', '', '1', '58151044',
          'Rua do Galpão', '2296', '', 'Centro', 'Ribeirão Preto', 'SP', '14076-988', '3543402',
          '1600000000', 'fiscal@example.test')
      `)
    }
    await db.execute(sql`
      insert into company_route_optimization_settings
        (company_id, origin_address_key, end_policy, timezone)
      values (${lastStopCompanyId}, '', 'last_stop', 'America/Sao_Paulo'),
        (${configuredCompanyId}, ${CONFIGURED_KEY}, 'depot', 'America/Sao_Paulo')
    `)
    await db.execute(sql`
      insert into geocoded_addresses
        (address_key, latitude, longitude, precision, source, external_place_id)
      values (${CONFIGURED_KEY}, '-21.1767000', '-47.8208000', 'rooftop', 'manual', '')
    `)
  })

  afterAll(async () => {
    try {
      await database?.close()
    } finally {
      try {
        await admin?.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin?.close({ timeout: 0 })
      }
    }
  })

  test('sem perfil nem configuração, o barracão não está cadastrado', async () => {
    expect(await readDepots().readDepot({ companyId: bareCompanyId })).toEqual({
      reason: 'not_configured',
      status: 'absent',
    })
  })

  test('o endereço da empresa sem coordenada avisa, e diz de onde veio', async () => {
    expect(await readDepots().readDepot({ companyId: fallbackCompanyId })).toEqual({
      originSource: 'company_address',
      reason: 'not_geocoded',
      status: 'absent',
    })
  })

  test('geocodificado, a rota parte do endereço da empresa e volta pela política padrão', async () => {
    await database?.db.execute(sql`
      insert into geocoded_addresses
        (address_key, latitude, longitude, precision, source, external_place_id)
      values (${COMPANY_KEY}, '-21.1800000', '-47.8100000', 'postal_code', 'postal_code', '')
    `)
    const point = { latitude: -21.18, longitude: -47.81 }

    expect(await readDepots().readDepot({ companyId: fallbackCompanyId })).toEqual({
      end: point,
      origin: point,
      originSource: 'company_address',
      status: 'resolved',
    })
    /** A linha com origem vazia ainda manda na política de fim. */
    expect(await readDepots().readDepot({ companyId: lastStopCompanyId })).toEqual({
      end: null,
      origin: point,
      originSource: 'company_address',
      status: 'resolved',
    })
  })

  test('a origem configurada vence o endereço da empresa', async () => {
    const depot = await readDepots().readDepot({ companyId: configuredCompanyId })

    expect(depot).toMatchObject({ originSource: 'route_settings', status: 'resolved' })
    expect(depot.status === 'resolved' ? depot.origin : null).toEqual({
      latitude: -21.1767,
      longitude: -47.8208,
    })
  })
})
