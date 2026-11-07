/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq } from 'drizzle-orm'

import { fleetDrivers } from '../../database/fleet.schema.js'
import { tripDrivers } from '../../database/trip.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'
import { toWhatsAppPhone } from '../../whatsapp-commands/domain/whatsapp-phone.policy.js'

export type CurrentTripDriver = {
  readonly id: string
  readonly name: string
  readonly phone: string
}

/** O condutor atual da viagem: o primeiro da tripulação com papel de motorista (a troca de tripulação reescreve a lista). */
export async function readCurrentTripDriver(
  executor: TripQueryable,
  params: { readonly companyId: string; readonly tripId: string },
): Promise<CurrentTripDriver | undefined> {
  const [row] = await executor
    .select({ id: fleetDrivers.id, name: fleetDrivers.name, phone: fleetDrivers.phone })
    .from(tripDrivers)
    .innerJoin(
      fleetDrivers,
      and(
        eq(fleetDrivers.companyId, tripDrivers.companyId),
        eq(fleetDrivers.id, tripDrivers.driverId),
      ),
    )
    .where(
      and(
        eq(tripDrivers.companyId, params.companyId),
        eq(tripDrivers.tripId, params.tripId),
        eq(tripDrivers.role, 'driver'),
      ),
    )
    .orderBy(asc(tripDrivers.position))
    .limit(1)
  return row
}

/** O número que a marca do grupo pede (`readCurrentDriverNumber` do remetente): o do motorista atual, ou nenhum. */
export function createCurrentDriverNumberReader(executor: TripQueryable) {
  return async (params: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<string | undefined> => {
    const driver = await readCurrentTripDriver(executor, params)
    return driver === undefined ? undefined : toWhatsAppPhone(driver.phone)
  }
}
