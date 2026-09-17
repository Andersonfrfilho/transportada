/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T201: a consulta paginada do catálogo, com busca, `seen` e o ajuste da empresa lado a
 * lado — nunca compostos aqui. Contra Postgres de verdade porque o que se prova é a forma do
 * `LEFT JOIN` (busca, paginação, isolamento de tenant), que um fake de repositório não exercita.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  companies,
  companyTollBoothCharges,
  tollBooths,
} from '../../src/database/database.schema.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { resolveEffectiveTollBoothCharge } from '../../src/companies/domain/toll-booth-charge.policy.js'
import { createDrizzleTollBoothCatalogRepository } from '../../src/toll-booths/infrastructure/drizzle-toll-booth-catalog.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('toll booth catalog repository (spec 154, T201)', () => {
  testWithPostgres('matches the search term against the booth name', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await seedTollBooth({ database, name: 'Pedágio Nova Odessa', osmNodeId: 1n })
      await seedTollBooth({
        database,
        name: 'Pedágio Anhanguera',
        operator: 'Ecovias',
        osmNodeId: 2n,
      })

      const page = await repository(database).listCatalog({
        companyId,
        search: 'Nova Odessa',
        seenOsmNodeIds: [],
      })

      expect(page.rows.map((row) => row.catalog.name)).toEqual(['Pedágio Nova Odessa'])
    })
  })

  testWithPostgres('matches the search term against the operator', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await seedTollBooth({
        database,
        name: 'Pedágio Nova Odessa',
        operator: 'CCR AutoBAn',
        osmNodeId: 1n,
      })
      await seedTollBooth({
        database,
        name: 'Pedágio Anhanguera',
        operator: 'Ecovias',
        osmNodeId: 2n,
      })

      const page = await repository(database).listCatalog({
        companyId,
        search: 'Ecovias',
        seenOsmNodeIds: [],
      })

      expect(page.rows.map((row) => row.catalog.operator)).toEqual(['Ecovias'])
    })
  })

  testWithPostgres('clamps perPage at the 100 cap, never the caller value', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await seedTollBooth({ database, osmNodeId: 1n })

      const page = await repository(database).listCatalog({
        companyId,
        perPage: 500,
        seenOsmNodeIds: [],
      })

      expect(page.perPage).toBe(100)
    })
  })

  testWithPostgres('paginates by offset across pages', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await seedTollBooth({ database, name: 'A', osmNodeId: 1n })
      await seedTollBooth({ database, name: 'B', osmNodeId: 2n })
      await seedTollBooth({ database, name: 'C', osmNodeId: 3n })

      const secondPage = await repository(database).listCatalog({
        companyId,
        page: 2,
        perPage: 2,
        seenOsmNodeIds: [],
      })

      expect(secondPage.total).toBe(3)
      expect(secondPage.rows).toHaveLength(1)
    })
  })

  testWithPostgres('marks seen true only for a booth already crossed', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await seedTollBooth({ database, osmNodeId: 111n })
      await seedTollBooth({ database, osmNodeId: 222n })

      const page = await repository(database).listCatalog({
        companyId,
        seenOsmNodeIds: [111],
      })

      const seenByNode = new Map(page.rows.map((row) => [row.osmNodeId, row.seen]))
      expect(seenByNode.get(111)).toBe(true)
      expect(seenByNode.get(222)).toBe(false)
    })
  })

  // A regra em si (spec 086) já tem suíte própria — aqui só se prova que ESTE repositório nunca a
  // executa: catálogo e ajuste chegam crus, e é o teste, não o repositório, quem os compõe.
  testWithPostgres(
    'keeps the adjustment separate from the catalog value — the policy composes, never the repository',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        await seedTollBooth({ chargePerAxle: '10.0000', database, osmNodeId: 1n })
        await seedAdjustment({
          chargePerAxle: '8.5000',
          companyId,
          database,
          osmNodeId: 1n,
        })

        const page = await repository(database).listCatalog({ companyId, seenOsmNodeIds: [] })
        const [row] = page.rows

        expect(row?.catalog.chargePerAxle).toBe('10.0000')
        expect(row?.adjustment?.chargePerAxle).toBe('8.5000')

        const effective = resolveEffectiveTollBoothCharge({
          adjustment: row?.adjustment ?? null,
          catalog: row!.catalog,
        })
        expect(effective.effectiveChargePerAxle).toBe('8.5000')
        expect(effective.chargePerAxleSource).toBe('manual')
      })
    },
  )

  testWithPostgres('never leaks another company adjustment onto the same booth', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const otherCompanyId = await seedCompany(database)
      await seedTollBooth({ database, osmNodeId: 1n })
      await seedTollBooth({ database, osmNodeId: 2n })
      await seedAdjustment({ chargePerAxle: '8.5000', companyId, database, osmNodeId: 1n })
      await seedAdjustment({
        chargePerAxle: '9.9000',
        companyId: otherCompanyId,
        database,
        osmNodeId: 2n,
      })

      const page = await repository(database).listCatalog({ companyId, seenOsmNodeIds: [] })
      const adjustmentByNode = new Map(page.rows.map((row) => [row.osmNodeId, row.adjustment]))

      expect(adjustmentByNode.get(1)?.chargePerAxle).toBe('8.5000')
      expect(adjustmentByNode.get(2)).toBeNull()
    })
  })

  testWithPostgres('answers an empty page when the catalog has never been seeded', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)

      const page = await repository(database).listCatalog({ companyId, seenOsmNodeIds: [] })

      expect(page).toEqual({ page: 1, perPage: 20, rows: [], total: 0 })
    })
  })
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

function repository(database: TestDatabase) {
  return createDrizzleTollBoothCatalogRepository(database.db)
}

async function seedCompany(database: TestDatabase): Promise<string> {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedTollBooth(input: {
  readonly chargeCar?: string
  readonly chargePerAxle?: string
  readonly database: TestDatabase
  readonly name?: string
  readonly operator?: string
  readonly osmNodeId: bigint
}): Promise<void> {
  await input.database.db.insert(tollBooths).values({
    chargeCar: input.chargeCar ?? null,
    chargePerAxle: input.chargePerAxle ?? null,
    latitude: '-22.7706642',
    longitude: '-47.2387170',
    name: input.name ?? 'Pedágio genérico',
    observedOn: '2026-09-14',
    operator: input.operator ?? 'CCR AutoBAn',
    osmNodeId: input.osmNodeId,
  })
}

async function seedAdjustment(input: {
  readonly chargeCar?: string
  readonly chargePerAxle?: string
  readonly companyId: string
  readonly database: TestDatabase
  readonly osmNodeId: bigint
}): Promise<void> {
  await input.database.db.insert(companyTollBoothCharges).values({
    actorUserId: crypto.randomUUID(),
    chargeCar: input.chargeCar ?? null,
    chargePerAxle: input.chargePerAxle ?? null,
    companyId: input.companyId,
    observedOn: '2026-09-14',
    osmNodeId: input.osmNodeId,
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_toll_catalog_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
