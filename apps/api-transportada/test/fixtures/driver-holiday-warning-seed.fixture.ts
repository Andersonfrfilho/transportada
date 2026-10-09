/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3: o que a integração do aviso do motorista semeia — a conta de um motorista (usuário, vínculo
 * e cadastro), uma viagem `in_transit` dele com várias paradas (cada uma com a cidade do destino, a ETA e,
 * se for o caso, a conclusão) e a parada em andamento. Em série, como o resto. Dados inventados.
 */
import { eq } from 'drizzle-orm'

import {
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  tripDrivers,
  tripStops,
  trips,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import type { TripStatus } from '../../src/database/trip.schema.js'
import type { TestDatabase } from './cargo-arrival-database.fixture.js'
import {
  seedTripWithStops,
  type SeededStops,
  type SeedStopParams,
} from './trip-holiday-warning-seed.fixture.js'

const TAX_ID_LENGTH = 11
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'

export type SeededDriverAccount = {
  readonly driverId: string
  readonly membershipId: string
  readonly taxId: string
  readonly userId: string
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => String(Math.floor(Math.random() * 10))).join('')
}

function randomPlate(): string {
  const letter = () => LETTERS[Math.floor(Math.random() * LETTERS.length)] ?? 'A'
  return `${letter()}${letter()}${letter()}${randomDigits(1)}${letter()}${randomDigits(2)}`
}

/** Usuário, vínculo com a empresa e cadastro de motorista: o que `findDriverIdByMembership` resolve. */
export async function seedDriverAccount(
  database: TestDatabase,
  companyId: string,
): Promise<SeededDriverAccount> {
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const taxId = randomDigits(TAX_ID_LENGTH)
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db
    .insert(fleetDrivers)
    .values({ companyId, id: driverId, membershipId, name: 'Motorista', taxId })
  return { driverId, membershipId, taxId, userId }
}

export type SeedDriverTripParams = {
  readonly companyId: string
  readonly driver: SeededDriverAccount
  readonly status?: TripStatus
  readonly stops: readonly SeedStopParams[]
}

/** Uma viagem com as paradas dadas, em andamento na rua, com o motorista como titular. */
export async function seedDriverTrip(
  database: TestDatabase,
  params: SeedDriverTripParams,
): Promise<SeededStops> {
  const { companyId, driver } = params
  const seeded = await seedTripWithStops(database, { companyId, stops: params.stops })
  const vehicleId = crypto.randomUUID()
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: randomPlate(),
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db
    .update(trips)
    .set({ status: params.status ?? 'in_transit', vehicleId })
    .where(eq(trips.id, seeded.tripId))
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId: driver.driverId,
    driverName: 'Motorista',
    driverTaxId: driver.taxId,
    position: 1n,
    tripId: seeded.tripId,
  })
  return seeded
}

/** A parada em andamento: o motorista já chegou nela, ou já tocou em "Iniciar rota" para ela. */
export async function markStopInProgress(
  database: TestDatabase,
  params: { readonly kind: 'arrived' | 'en_route'; readonly stopId: string; readonly at: Date },
): Promise<void> {
  const change =
    params.kind === 'arrived'
      ? { arrivedAt: params.at }
      : { enRouteSince: params.at, enRouteTappedAt: params.at }
  await database.db.update(tripStops).set(change).where(eq(tripStops.id, params.stopId))
}
