/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, ilike, lt, ne, or, sql } from 'drizzle-orm'

import { fleetVehicles } from '../../database/database.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import type {
  FleetFuelPricePort,
  FleetVehicle,
  FleetVehicleFilters,
  FleetVehicleInput,
  FleetVehiclePage,
  FleetVehicleRepositoryPort,
} from '../application/fleet.port.js'
import type { FleetVehicleStatus } from '../../database/fleet.schema.js'
import type { EffectiveFuelPrice } from '../../companies/domain/fuel-price.policy.js'
import type { FuelProduct } from '../../shared/fuel.constant.js'
import { FleetVehiclePlateTakenError } from '../domain/fleet.error.js'
import { hasInformedCosts } from '../domain/vehicle-cost.policy.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import { mapVehicle, toVehicleColumns } from './fleet.mapper.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const PLATE_CONSTRAINT = 'fleet_vehicles_company_id_plate_unique'

type RepositoryDependencies = {
  readonly database: Database
  readonly fuelPrices: FleetFuelPricePort
}

export class DrizzleFleetVehicleRepository implements FleetVehicleRepositoryPort {
  private readonly database: Database

  private readonly fuelPrices: FleetFuelPricePort

  public constructor(dependencies: RepositoryDependencies) {
    this.database = dependencies.database
    this.fuelPrices = dependencies.fuelPrices
  }

  public async create(input: {
    readonly companyId: string
    readonly vehicle: FleetVehicleInput
  }): Promise<FleetVehicle> {
    const record = await runGuarded(async () => {
      const [created] = await this.database
        .insert(fleetVehicles)
        .values({
          ...toVehicleColumns(input.vehicle),
          companyId: input.companyId,
          costsUpdatedAt: hasInformedCosts(input.vehicle) ? new Date() : null,
        })
        .returning()
      return created
    })
    if (record === undefined) throw new Error('FLEET_VEHICLE_CREATE_FAILED')
    return mapVehicle({ fuelPrices: await this.resolvePrices(input.companyId), record })
  }

  public async findById(input: {
    readonly companyId: string
    readonly vehicleId: string
  }): Promise<FleetVehicle | null> {
    const [record] = await this.database
      .select()
      .from(fleetVehicles)
      .where(
        and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)),
      )
      .limit(1)
    if (record === undefined) return null
    return mapVehicle({ fuelPrices: await this.resolvePrices(input.companyId), record })
  }

  public async list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: FleetVehicleFilters
    readonly limit: number
  }): Promise<FleetVehiclePage> {
    const cursor = decodeKeysetCursor(input.cursor)
    const records = await this.database
      .select()
      .from(fleetVehicles)
      .where(
        and(
          eq(fleetVehicles.companyId, input.companyId),
          cursor === null
            ? undefined
            : or(
                lt(fleetVehicles.createdAt, cursor.createdAt),
                and(eq(fleetVehicles.createdAt, cursor.createdAt), lt(fleetVehicles.id, cursor.id)),
              ),
          input.filters?.statusEq === undefined
            ? undefined
            : eq(fleetVehicles.status, input.filters.statusEq),
          input.filters?.roleEq === undefined
            ? undefined
            : eq(fleetVehicles.role, input.filters.roleEq),
          input.filters?.plateContains === undefined
            ? undefined
            : ilike(fleetVehicles.plate, `%${input.filters.plateContains}%`),
        ),
      )
      .orderBy(desc(fleetVehicles.createdAt), desc(fleetVehicles.id))
      .limit(input.limit + 1)

    const pageRecords = records.slice(0, input.limit)
    const last = pageRecords.at(-1)
    const fuelPrices = await this.resolvePrices(input.companyId)

    return {
      items: pageRecords.map((record) => mapVehicle({ fuelPrices, record })),
      nextCursor:
        records.length > input.limit && last !== undefined ? encodeKeysetCursor(last) : null,
    }
  }

  public async update(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly status: FleetVehicleStatus
    readonly vehicle: FleetVehicleInput
    readonly vehicleId: string
  }): Promise<FleetVehicle | null> {
    const record = await runGuarded(async () => {
      const [updated] = await this.database
        .update(fleetVehicles)
        .set({
          ...toVehicleColumns(input.vehicle),
          costsUpdatedAt: sql`case when ${or(
            ne(fleetVehicles.acquisitionAmount, input.vehicle.acquisitionAmount),
            ne(fleetVehicles.annualInsuranceAmount, input.vehicle.annualInsuranceAmount),
            ne(fleetVehicles.annualVehicleTaxAmount, input.vehicle.annualVehicleTaxAmount),
            ne(fleetVehicles.averageConsumption, input.vehicle.averageConsumption),
            ne(fleetVehicles.secondaryFuelType, input.vehicle.secondaryFuelType),
            ne(
              fleetVehicles.secondaryAverageConsumption,
              input.vehicle.secondaryAverageConsumption,
            ),
            ne(fleetVehicles.otherCostsPerKilometer, input.vehicle.otherCostsPerKilometer),
            ne(fleetVehicles.monthlyInstallmentAmount, input.vehicle.monthlyInstallmentAmount),
          )} then now() else ${fleetVehicles.costsUpdatedAt} end`,
          status: input.status,
          updatedAt: new Date(),
          version: BigInt(input.expectedVersion) + 1n,
        })
        .where(
          and(
            eq(fleetVehicles.companyId, input.companyId),
            eq(fleetVehicles.id, input.vehicleId),
            eq(fleetVehicles.version, BigInt(input.expectedVersion)),
          ),
        )
        .returning()
      return updated
    })
    if (record === undefined) return null
    return mapVehicle({ fuelPrices: await this.resolvePrices(input.companyId), record })
  }

  private async resolvePrices(
    companyId: string,
  ): Promise<ReadonlyMap<FuelProduct, EffectiveFuelPrice>> {
    return this.fuelPrices.resolveByProduct({ companyId })
  }
}

async function runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    if (violatedUniqueConstraint(error) === PLATE_CONSTRAINT)
      throw new FleetVehiclePlateTakenError()
    throw error
  }
}
