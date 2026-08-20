/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetDrivers } from '../../src/database/database.schema.js'
import type { FreightRegionInput } from '../../src/freight-regions/application/freight-region.port.js'
import { DrizzleFleetDriverRegionRepository } from '../../src/freight-regions/infrastructure/drizzle-fleet-driver-region.repository.js'
import { DrizzleFreightRegionRepository } from '../../src/freight-regions/infrastructure/drizzle-freight-region.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const BARRETOS_ZONE_ONE: FreightRegionInput = {
  cities: [
    { city: 'Barretos', state: 'sp' },
    { city: '  barrinha ', state: 'SP' },
  ],
  code: '1.000',
  name: 'Barretos Zona 1',
  rates: [
    { driverAmount: '1086.1200', freightClass: 'truck' },
    { driverAmount: '812.4500', freightClass: 'toco' },
  ],
}

const JABOTICABAL_ZONE_ONE: FreightRegionInput = {
  cities: [{ city: 'BARRINHA', state: 'SP' }],
  code: '5.000',
  name: 'Jaboticabal Zona 1',
  rates: [{ driverAmount: '640.0000', freightClass: 'truck' }],
}

const FRANCA_ZONE_TWO: FreightRegionInput = {
  cities: [{ city: 'Franca', state: 'SP' }],
  code: '7.001',
  name: 'Franca Zona 2',
  rates: [{ driverAmount: '1500.0000', freightClass: 'vuc' }],
}

describe('freight region repository integration', () => {
  /**
   * O aceite da T005. Três rotas com cidades e valores saem em três consultas — página, cidades,
   * valores — e não em três por linha. Contar as consultas é o único jeito de a regressão aparecer:
   * um `map` com `await` dentro devolve exatamente o mesmo corpo.
   */
  testWithPostgres('reads a page of regions with cities and rates in one query each', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const counted = countingDatabase(database.db)
      const repository = new DrizzleFreightRegionRepository(counted.database)

      for (const region of [BARRETOS_ZONE_ONE, JABOTICABAL_ZONE_ONE, FRANCA_ZONE_TWO]) {
        await repository.create({ companyId, region })
      }

      counted.reset()
      const page = await repository.list({ companyId, cursor: null, limit: 20 })

      expect(page.items).toHaveLength(3)
      expect(counted.selects()).toBe(3)
      expect(page.nextCursor).toBeNull()
    })
  })

  /** Cidade e valor têm de voltar na rota certa: uma junção errada troca o preço de duas rotas. */
  testWithPostgres('keeps every city and rate under its own region', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const repository = new DrizzleFreightRegionRepository(database.db)

      await repository.create({ companyId, region: BARRETOS_ZONE_ONE })
      await repository.create({ companyId, region: JABOTICABAL_ZONE_ONE })

      const page = await repository.list({ companyId, cursor: null, limit: 20 })
      const barretos = page.items.find((item) => item.code === '1.000')
      const jaboticabal = page.items.find((item) => item.code === '5.000')

      expect(barretos?.zone).toBe(1)
      expect(barretos?.cities).toEqual([
        { city: 'BARRETOS', state: 'SP' },
        { city: 'BARRINHA', state: 'SP' },
      ])
      expect(barretos?.rates).toEqual([
        { driverAmount: '812.4500', freightClass: 'toco' },
        { driverAmount: '1086.1200', freightClass: 'truck' },
      ])
      expect(jaboticabal?.cities).toEqual([{ city: 'BARRINHA', state: 'SP' }])
      expect(jaboticabal?.rates).toEqual([{ driverAmount: '640.0000', freightClass: 'truck' }])
    })
  })

  /** A zona sai do código impresso, sempre. Digitada em separado, ela divergiria da rota. */
  testWithPostgres('derives the zone from the printed route code', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const repository = new DrizzleFreightRegionRepository(database.db)

      const headOffice = await repository.create({
        companyId,
        region: { cities: [], code: '0.001', name: 'Ribeirão Preto', rates: [] },
      })
      const franca = await repository.create({ companyId, region: FRANCA_ZONE_TWO })

      expect(headOffice.zone).toBe(0)
      expect(franca.zone).toBe(2)
    })
  })

  testWithPostgres('never reads a region of another company', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const otherCompanyId = await seedCompany(database)
      const repository = new DrizzleFreightRegionRepository(database.db)

      const own = await repository.create({ companyId, region: BARRETOS_ZONE_ONE })
      await repository.create({ companyId: otherCompanyId, region: JABOTICABAL_ZONE_ONE })

      const page = await repository.list({ companyId, cursor: null, limit: 20 })
      expect(page.items.map((item) => item.code)).toEqual(['1.000'])
      expect(await repository.findById({ companyId: otherCompanyId, regionId: own.id })).toBeNull()
    })
  })

  /** Trocar a lista é apagar e reescrever: cidade removida da tabela do cliente some da rota. */
  testWithPostgres('replaces cities and rates on update and bumps the version', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const repository = new DrizzleFreightRegionRepository(database.db)
      const created = await repository.create({ companyId, region: BARRETOS_ZONE_ONE })

      const updated = await repository.update({
        companyId,
        expectedVersion: created.version,
        region: {
          cities: [{ city: 'Colina', state: 'SP' }],
          code: '1.000',
          name: 'Barretos Zona 1',
          rates: [{ driverAmount: '900.0000', freightClass: 'truck' }],
        },
        regionId: created.id,
        status: 'inactive',
      })

      expect(updated?.cities).toEqual([{ city: 'COLINA', state: 'SP' }])
      expect(updated?.rates).toEqual([{ driverAmount: '900.0000', freightClass: 'truck' }])
      expect(updated?.status).toBe('inactive')
      expect(BigInt(updated?.version ?? '0')).toBe(BigInt(created.version) + 1n)
    })
  })

  /** Versão velha é escrita de quem leu a tela antes da mudança — recusar é o ponto do campo. */
  testWithPostgres('refuses an update carrying a stale version', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const repository = new DrizzleFreightRegionRepository(database.db)
      const created = await repository.create({ companyId, region: BARRETOS_ZONE_ONE })
      await repository.update({
        companyId,
        expectedVersion: created.version,
        region: BARRETOS_ZONE_ONE,
        regionId: created.id,
        status: 'active',
      })

      const stale = await repository.update({
        companyId,
        expectedVersion: created.version,
        region: BARRETOS_ZONE_ONE,
        regionId: created.id,
        status: 'active',
      })
      expect(stale).toBeNull()
    })
  })
})

describe('fleet driver region repository integration', () => {
  /**
   * O motorista soma zona inteira e cidade solta na mesma lista — foi o que o usuário pediu. Uma
   * consulta traz as duas com o código e o nome da rota; duas listagens dariam duas verdades.
   */
  testWithPostgres('lists zones and single cities of a driver in one query', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const driverId = await seedDriver(database, companyId)
      const regions = new DrizzleFreightRegionRepository(database.db)
      const barretos = await regions.create({ companyId, region: BARRETOS_ZONE_ONE })
      const franca = await regions.create({ companyId, region: FRANCA_ZONE_TWO })

      const counted = countingDatabase(database.db)
      const coverage = new DrizzleFleetDriverRegionRepository(counted.database)
      await coverage.replaceForDriver({
        companyId,
        driverId,
        entries: [
          { city: '', regionId: barretos.id, scope: 'region', state: '' },
          { city: ' franca ', regionId: franca.id, scope: 'city', state: 'sp' },
        ],
      })

      counted.reset()
      const listed = await coverage.listByDriver({ companyId, driverId })

      expect(counted.selects()).toBe(1)
      expect(listed).toEqual([
        {
          city: '',
          code: '1.000',
          name: 'Barretos Zona 1',
          regionId: barretos.id,
          scope: 'region',
          state: '',
          zone: 1,
        },
        {
          city: 'FRANCA',
          code: '7.001',
          name: 'Franca Zona 2',
          regionId: franca.id,
          scope: 'city',
          state: 'SP',
          zone: 2,
        },
      ])
    })
  })

  /** Substituir é a operação inteira: o que saiu da lista deixa de valer no mesmo instante. */
  testWithPostgres('replaces the whole coverage of a driver', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const driverId = await seedDriver(database, companyId)
      const regions = new DrizzleFreightRegionRepository(database.db)
      const barretos = await regions.create({ companyId, region: BARRETOS_ZONE_ONE })
      const franca = await regions.create({ companyId, region: FRANCA_ZONE_TWO })
      const coverage = new DrizzleFleetDriverRegionRepository(database.db)

      await coverage.replaceForDriver({
        companyId,
        driverId,
        entries: [{ city: '', regionId: barretos.id, scope: 'region', state: '' }],
      })
      const replaced = await coverage.replaceForDriver({
        companyId,
        driverId,
        entries: [{ city: '', regionId: franca.id, scope: 'region', state: '' }],
      })

      expect(replaced.map((entry) => entry.code)).toEqual(['7.001'])
    })
  })

  /** Cobertura da rota de outro tenant não é 500: é lista de ids que não existem para esta empresa. */
  testWithPostgres('reports which region ids exist for the company', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const otherCompanyId = await seedCompany(database)
      const regions = new DrizzleFreightRegionRepository(database.db)
      const own = await regions.create({ companyId, region: BARRETOS_ZONE_ONE })
      const foreign = await regions.create({
        companyId: otherCompanyId,
        region: JABOTICABAL_ZONE_ONE,
      })
      const coverage = new DrizzleFleetDriverRegionRepository(database.db)

      const existing = await coverage.listExistingRegionIds({
        companyId,
        regionIds: [own.id, foreign.id],
      })
      expect(existing).toEqual([own.id])
    })
  })
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type Database = TestDatabase['db']

type CountedDatabase = {
  readonly database: Database
  readonly reset: () => void
  readonly selects: () => number
}

/**
 * Conta os `select` que a chamada emitiu. Não é elegância de teste: é a única evidência de que a
 * listagem não voltou a buscar cidade por linha, porque o corpo devolvido é idêntico dos dois jeitos.
 */
function countingDatabase(database: Database): CountedDatabase {
  let selects = 0
  const proxy = new Proxy(database, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value !== 'function') return value
      const method = value as (...args: readonly unknown[]) => unknown
      // O `this` volta a ser o alvo: o drizzle monta a consulta lendo o próprio estado interno
      return (...parameters: readonly unknown[]) => {
        if (property === 'select') selects += 1
        return Reflect.apply(method, target, parameters)
      }
    },
  })
  return {
    database: proxy,
    reset: () => {
      selects = 0
    },
    selects: () => selects,
  }
}

async function seedCompany(database: TestDatabase): Promise<string> {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

let driverSequence = 0

async function seedDriver(database: TestDatabase, companyId: string): Promise<string> {
  driverSequence += 1
  const [driver] = await database.db
    .insert(fleetDrivers)
    .values({
      companyId,
      name: 'Motorista de Teste',
      taxId: String(10_000_000_000 + driverSequence),
    })
    .returning({ id: fleetDrivers.id })
  if (driver === undefined) throw new Error('Driver seed failed')
  return driver.id
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t005_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
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
