/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, trips } from '../../src/database/database.schema.js'
import type {
  FleetFuelPricePort,
  FleetVehicleInput,
} from '../../src/fleet/application/fleet.port.js'
import type { EffectiveFuelPrice } from '../../src/companies/domain/fuel-price.policy.js'
import type { FuelProduct } from '../../src/shared/fuel.constant.js'
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
  loadingAccess: 'rear',
  brand: '',
  capacityCubicMeters: '90.00',
  cargoHeightMeters: '0.00',
  cargoLengthMeters: '0.00',
  cargoWidthMeters: '0.00',
  capacityKilograms: '27000.00',
  color: '',
  defaultTrailerVehicleId: null,
  fleetNumber: '',
  fuelType: 'diesel-s10',
  hasAutomaticTollPayment: false,
  model: '',
  modelYear: 0,
  monthlyInstallmentAmount: '0.0000',
  otherCostsPerKilometer: '0.0000',
  owner: null,
  ownership: 'own',
  plate: 'ABC1D23',
  renavam: '12345678901',
  role: 'traction',
  secondaryAverageConsumption: '0.00',
  secondaryFuelType: '',
  state: 'SP',
  tareWeightKilograms: '8000.00',
  vehicleType: 'tractor_unit',
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

  testWithPostgres(
    'round-trips the second tank and bumps costsUpdatedAt by its consumption',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        const repository = createRepository(database)

        const created = await repository.create({
          companyId,
          vehicle: {
            ...NO_COSTS_VEHICLE,
            secondaryAverageConsumption: '8.00',
            secondaryFuelType: 'etanol-hidratado',
          },
        })

        expect(created.secondaryFuelType).toBe('etanol-hidratado')
        expect(created.secondaryAverageConsumption).toBe('8.00')
        // Sem isto a ficha com só o segundo tanque preenchido diria que nenhum custo foi informado
        expect(created.costsUpdatedAt).not.toBeNull()

        const read = await repository.findById({ companyId, vehicleId: created.id })
        expect(read?.secondaryFuelType).toBe('etanol-hidratado')
        expect(read?.secondaryAverageConsumption).toBe('8.00')
      })
    },
  )

  /**
   * Dois produtos por veículo não podem virar duas consultas por linha: a tabela da empresa é
   * resolvida uma vez e os dois preços saem dela.
   */
  testWithPostgres(
    'resolves the company fuel table once for a whole page of vehicles',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        const counter = new CountingFuelPricePort(
          new CompanyFuelPriceGateway(new DrizzleFuelPriceRepository(database.db)),
        )
        const repository = new DrizzleFleetVehicleRepository({
          database: database.db,
          fuelPrices: counter,
        })

        for (const plate of ['ABC1D23', 'XYZ9A88', 'QRS4E56']) {
          await repository.create({
            companyId,
            vehicle: {
              ...NO_COSTS_VEHICLE,
              averageConsumption: '12.00',
              plate,
              secondaryAverageConsumption: '8.00',
              secondaryFuelType: 'etanol-hidratado',
            },
          })
        }

        counter.reset()
        const page = await repository.list({ companyId, cursor: null, limit: 10 })

        expect(page.items).toHaveLength(3)
        expect(counter.calls).toBe(1)
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

  // Feature 147 T9: as duas fontes de uso — carreta padrão de outro cavalo, e viagem aberta.
  testWithPostgres('reports a trailer in use by a default pointer or an open trip', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      const repository = createRepository(database)

      const trailer = await repository.create({
        companyId,
        vehicle: { ...NO_COSTS_VEHICLE, plate: 'RTC4H67', role: 'trailer', vehicleType: '' },
      })
      const freeTrailer = await repository.create({
        companyId,
        vehicle: { ...NO_COSTS_VEHICLE, plate: 'RTD5J78', role: 'trailer', vehicleType: '' },
      })
      expect(await repository.isTrailerInUse({ companyId, vehicleId: freeTrailer.id })).toBe(false)

      await repository.create({
        companyId,
        vehicle: { ...NO_COSTS_VEHICLE, defaultTrailerVehicleId: trailer.id, plate: 'RTE6K89' },
      })
      expect(await repository.isTrailerInUse({ companyId, vehicleId: trailer.id })).toBe(true)

      const tractor = await repository.create({
        companyId,
        vehicle: { ...NO_COSTS_VEHICLE, plate: 'RTF7L90' },
      })
      const [trip] = await database.db
        .insert(trips)
        .values({
          companyId,
          status: 'draft',
          trailerVehicleId: freeTrailer.id,
          vehicleId: tractor.id,
        })
        .returning({ id: trips.id })
      expect(trip).toBeDefined()
      expect(await repository.isTrailerInUse({ companyId, vehicleId: freeTrailer.id })).toBe(true)

      await database.db.update(trips).set({ status: 'cancelled' }).where(eq(trips.id, trip!.id))
      expect(await repository.isTrailerInUse({ companyId, vehicleId: freeTrailer.id })).toBe(false)
    })
  })

  /**
   * T18 (revisão, MENOR 6): os dois CHECKs da carreta padrão (`fleet.schema.ts`) traduzem para 400
   * de domínio, nunca para o 500 genérico que a violação crua produzia. O caso de uso já barra os
   * dois antes de chegar ao repositório (`checkVehicleDefaultTrailer`); aqui a escrita é direta,
   * como defesa contra quem chamar o repositório sem passar por ele.
   */
  testWithPostgres(
    'translates the default trailer CHECK violations into domain errors',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        const repository = createRepository(database)

        const tractor = await repository.create({ companyId, vehicle: NO_COSTS_VEHICLE })
        const trailer = await repository.create({
          companyId,
          vehicle: { ...NO_COSTS_VEHICLE, plate: 'RTC4H67', role: 'trailer', vehicleType: '' },
        })

        // fleet_vehicles_default_trailer_not_self: a carreta padrão não pode ser o próprio veículo.
        await expect(
          repository.update({
            companyId,
            expectedVersion: tractor.version,
            status: 'active',
            vehicle: { ...NO_COSTS_VEHICLE, defaultTrailerVehicleId: tractor.id },
            vehicleId: tractor.id,
          }),
        ).rejects.toMatchObject({
          code: 'FLEET_VEHICLE_DEFAULT_TRAILER_SELF_REFERENCE',
          status: 400,
        })

        // fleet_vehicles_default_trailer_tractor_only: só o cavalo mecânico aponta carreta padrão.
        await expect(
          repository.update({
            companyId,
            expectedVersion: tractor.version,
            status: 'active',
            vehicle: {
              ...NO_COSTS_VEHICLE,
              defaultTrailerVehicleId: trailer.id,
              vehicleType: 'truck',
            },
            vehicleId: tractor.id,
          }),
        ).rejects.toMatchObject({
          code: 'FLEET_VEHICLE_DEFAULT_TRAILER_REQUIRES_TRACTOR',
          status: 400,
        })
      })
    },
  )
})

/** Dublê fino sobre o gateway real: conta as resoluções sem trocar o preço que elas devolvem. */
class CountingFuelPricePort implements FleetFuelPricePort {
  public calls = 0

  private readonly inner: FleetFuelPricePort

  public constructor(inner: FleetFuelPricePort) {
    this.inner = inner
  }

  public async resolveByProduct(input: {
    readonly companyId: string
  }): Promise<ReadonlyMap<FuelProduct, EffectiveFuelPrice>> {
    this.calls += 1
    return this.inner.resolveByProduct(input)
  }

  public reset(): void {
    this.calls = 0
  }
}

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
