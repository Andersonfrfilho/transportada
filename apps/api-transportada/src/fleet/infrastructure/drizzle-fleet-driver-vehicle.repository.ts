/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { fleetDriverVehicleAssignments, fleetVehicles } from '../../database/database.schema.js'
import type {
  FleetDriverVehicleLink,
  FleetDriverVehicleRepositoryPort,
} from '../application/fleet.port.js'
import { mapVehicle } from './fleet.mapper.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export class DrizzleFleetDriverVehicleRepository implements FleetDriverVehicleRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async listByDriver(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly FleetDriverVehicleLink[]> {
    return listLiveLinks({ ...input, database: this.database })
  }

  public async listExistingVehicleIds(input: {
    readonly companyId: string
    readonly vehicleIds: readonly string[]
  }): Promise<readonly string[]> {
    if (input.vehicleIds.length === 0) return []

    const records = await this.database
      .select({ id: fleetVehicles.id })
      .from(fleetVehicles)
      .where(
        and(
          eq(fleetVehicles.companyId, input.companyId),
          inArray(fleetVehicles.id, [...input.vehicleIds]),
        ),
      )
    return records.map((record) => record.id)
  }

  /**
   * O vínculo é histórico: o que sai ganha `released_at` em vez de sumir, e o que já está vivo
   * é preservado para não reiniciar a data de início a cada gravação da tela.
   */
  public async replaceForDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly vehicleIds: readonly string[]
  }): Promise<readonly FleetDriverVehicleLink[]> {
    return this.database.transaction(async (transaction) => {
      const live = await transaction
        .select({ vehicleId: fleetDriverVehicleAssignments.vehicleId })
        .from(fleetDriverVehicleAssignments)
        .where(liveLinksOfDriver(input))

      const desired = new Set(input.vehicleIds)
      const released = live
        .map((record) => record.vehicleId)
        .filter((vehicleId) => !desired.has(vehicleId))
      const kept = new Set(live.map((record) => record.vehicleId))
      const added = input.vehicleIds.filter((vehicleId) => !kept.has(vehicleId))

      if (released.length > 0) {
        await transaction
          .update(fleetDriverVehicleAssignments)
          .set({ releasedAt: sql`now()`, updatedAt: sql`now()` })
          .where(
            and(
              liveLinksOfDriver(input),
              inArray(fleetDriverVehicleAssignments.vehicleId, released),
            ),
          )
      }

      if (added.length > 0) {
        await transaction.insert(fleetDriverVehicleAssignments).values(
          added.map((vehicleId) => ({
            companyId: input.companyId,
            driverId: input.driverId,
            vehicleId,
          })),
        )
      }

      return listLiveLinks({ ...input, database: transaction })
    })
  }
}

function liveLinksOfDriver(input: { readonly companyId: string; readonly driverId: string }) {
  return and(
    eq(fleetDriverVehicleAssignments.companyId, input.companyId),
    eq(fleetDriverVehicleAssignments.driverId, input.driverId),
    isNull(fleetDriverVehicleAssignments.releasedAt),
  )
}

async function listLiveLinks(input: {
  readonly companyId: string
  readonly database: Database | Transaction
  readonly driverId: string
}): Promise<readonly FleetDriverVehicleLink[]> {
  const records = await input.database
    .select({ assignment: fleetDriverVehicleAssignments, vehicle: fleetVehicles })
    .from(fleetDriverVehicleAssignments)
    .innerJoin(
      fleetVehicles,
      and(
        eq(fleetVehicles.companyId, fleetDriverVehicleAssignments.companyId),
        eq(fleetVehicles.id, fleetDriverVehicleAssignments.vehicleId),
      ),
    )
    .where(liveLinksOfDriver(input))
    .orderBy(asc(fleetDriverVehicleAssignments.assignedAt), asc(fleetVehicles.plate))

  return records.map((record) => ({
    assignedAt: record.assignment.assignedAt.toISOString(),
    id: record.assignment.id,
    vehicle: mapVehicle(record.vehicle),
  }))
}
