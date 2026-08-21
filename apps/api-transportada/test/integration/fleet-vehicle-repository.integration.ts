/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies } from '../../src/database/database.schema.js'
import type { FleetVehicleInput } from '../../src/fleet/application/fleet.port.js'
import { DrizzleFuelPriceRepository } from '../../src/companies/infrastructure/drizzle-fuel-price.repository.js'
import { CompanyFuelPriceGateway } from '../../src/fleet/infrastructure/company-fuel-price.gateway.js'
import { DrizzleFleetVehicleRepository } from '../../src/fleet/infrastructure/drizzle-fleet-vehicle.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const NO_COSTS_VEHICLE: FleetVehicleInput = {
  acquisitionAmount: '0.0000',
  annualInsuranceAmount: '0.0000',
  annualVehicleTaxAmount: '0.0000',
  averageConsumption: '0.00',
  axleCount: 0,
  bodyType: '00',
  brand: '',
  capacityCubicMeters: '90.00',
  capacityKilograms: '27000.00',
  color: '',
  fleetNumber: '',
  freightClass: '',
  fuelType: 'diesel-s10',
  model: '',
  modelYear: 0,
  monthlyInstallmentAmount: '0.0000',
  otherCostsPerKilometer: '0.0000',
  owner: null,
  ownership: 'own',
  plate: 'ABC1D23',
  renavam: '12345678901',
  role: 'traction',
  state: 'SP',
  tareWeightKilograms: '8000.00',
  wheelType: '03',
}

describe('fleet vehicle repository integration', () => {
  testWithPostgres(
    'sets costsUpdatedAt only when the vehicle is created with informed costs',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        const repository = createRepository(database)

        const withoutCosts = await repository.create({ companyId, vehicle: NO_COSTS_VEHICLE })
        expect(withoutCosts.costsUpdatedAt).toBeNull()

        const withCosts = await repository.create({
          companyId,
          vehicle: {
            ...NO_COSTS_VEHICLE,
            otherCostsPerKilometer: '1.5000',
            plate: 'XYZ9A88',
          },
        })
        expect(withCosts.costsUpdatedAt).not.toBeNull()
      })
    },
  )

  testWithPostgres('bumps costsUpdatedAt only when a cost field actually changes', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      const repository = createRepository(database)

      const created = await repository.create({
        companyId,
        vehicle: { ...NO_COSTS_VEHICLE, otherCostsPerKilometer: '1.5000' },
      })
      const firstCostsUpdatedAt = created.costsUpdatedAt
      expect(firstCostsUpdatedAt).not.toBeNull()

      const untouched = await repository.update({
        companyId,
        expectedVersion: created.version,
        status: 'active',
        vehicle: { ...NO_COSTS_VEHICLE, otherCostsPerKilometer: '1.5000', brand: 'VOLVO' },
        vehicleId: created.id,
      })
      expect(untouched?.costsUpdatedAt).toBe(firstCostsUpdatedAt)

      const changed = await repository.update({
        companyId,
        expectedVersion: untouched?.version ?? created.version,
        status: 'active',
        vehicle: { ...NO_COSTS_VEHICLE, otherCostsPerKilometer: '2.0000' },
        vehicleId: created.id,
      })
      expect(changed?.costsUpdatedAt).not.toBe(firstCostsUpdatedAt)
    })
  })
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

function createRepository(database: TestDatabase): DrizzleFleetVehicleRepository {
  return new DrizzleFleetVehicleRepository({
    database: database.db,
    fuelPrices: new CompanyFuelPriceGateway(new DrizzleFuelPriceRepository(database.db)),
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t015_${crypto.randomUUID().replaceAll('-', '')}`
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
