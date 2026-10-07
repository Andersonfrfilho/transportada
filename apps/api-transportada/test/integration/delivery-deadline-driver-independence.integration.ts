/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 236 T1.3 (CA6), contra Postgres real: a MESMA nota entregue tarde, com e sem prazo cadastrado,
 * dá a MESMA nota do motorista, a MESMA pontualidade e o mesmo `missingAfterHours`. O motorista A
 * entrega duas notas com chegada e prazo (`delivered_late`); o B, duas idênticas sem chegada (sem
 * selo). Ligar o prazo à nota, à pontualidade ou à foto ausente faria os dois divergirem.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import {
  fleetDrivers,
  identityUsers,
  storedObjects,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { classifyProofPunctuality } from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import {
  hasTestDatabase,
  ISSUER_TAX_ID,
  withCargoDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import type { TestDatabase } from '../fixtures/cargo-arrival-database.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import {
  ARRIVED_TUESDAY,
  readDeadlines,
  seedArrival,
  seedNotes,
  seedTripWithNotes,
} from '../fixtures/trip-delivery-deadline-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId
const NOW = new Date('2026-10-20T12:00:00.000Z')
const HOUR_MS = 3_600_000
const LATE_PHOTO_DELIVERED_AGO_MS = 72 * HOUR_MS
const MISSING_PHOTO_DELIVERED_AGO_MS = 25 * HOUR_MS
const MISSING_AFTER_HOURS = 24

type SeededDriver = { readonly driverId: string; readonly userId: string }

async function seedDriver(database: TestDatabase): Promise<SeededDriver> {
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId: COMPANY_ID, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetDrivers).values({
    companyId: COMPANY_ID,
    id: driverId,
    membershipId,
    name: 'Motorista',
    taxId: String(Math.floor(Math.random() * 1e11)).padStart(11, '0'),
  })
  return { driverId, userId }
}

type DeliverParams = {
  readonly deliveredAgoMs: number
  readonly driver: SeededDriver
  readonly isLatePhoto: boolean
  readonly stopId: string
  readonly tripDocumentId: string
  readonly tripId: string
}

async function deliver(database: TestDatabase, params: DeliverParams): Promise<void> {
  const deliveredAt = new Date(NOW.getTime() - params.deliveredAgoMs)
  await database.db
    .update(tripDocuments)
    .set({ deliveredAt, separationStatus: 'delivered' })
    .where(eq(tripDocuments.id, params.tripDocumentId))
  const eventId = crypto.randomUUID()
  await database.db.insert(tripStopEvents).values({
    actorUserId: params.driver.userId,
    channel: 'driver_app',
    companyId: COMPANY_ID,
    createdAt: deliveredAt,
    id: eventId,
    kind: 'delivered',
    recordedAt: deliveredAt,
    stopId: params.stopId,
    tripDocumentId: params.tripDocumentId,
  })
  if (!params.isLatePhoto) return

  const objectId = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: COMPANY_ID,
    id: objectId,
    mimeType: 'image/jpeg',
    objectKey: `proof/${objectId}.jpg`,
    provider: 's3',
    purpose: 'delivery_proof',
    sha256: objectId.replaceAll('-', '').padEnd(64, '0'),
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(tripDeliveryProofs).values({
    actorUserId: params.driver.userId,
    companyId: COMPANY_ID,
    kind: 'photo',
    objectId,
    punctuality: 'late',
    stopEventId: eventId,
  })
}

function classifyLatePhoto() {
  const deliveredAt = new Date(NOW.getTime() - LATE_PHOTO_DELIVERED_AGO_MS)
  return classifyProofPunctuality({
    capturedAt: undefined,
    deliveredAt,
    deliveryEventPosition: undefined,
    missingAfterHours: MISSING_AFTER_HOURS,
    photoMode: 'required',
    photoPosition: undefined,
    proofRadiusMeters: 150,
    proofWindowMinutes: 30,
    receivedAt: new Date(deliveredAt.getTime() + 2 * HOUR_MS),
  })
}

describe('o prazo de entrega não mexe no motorista (spec 236 T1.3, CA6)', () => {
  testWithPostgres(
    'a mesma nota entregue tarde, com e sem prazo: mesma nota, mesma pontualidade, mesma foto ausente',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        await database.db.insert(companyDeliveryProofSettings).values({
          companyId: COMPANY_ID,
          missingAfterHours: MISSING_AFTER_HOURS,
          photo: 'required',
          scoreEffectiveSince: new Date(NOW.getTime() - 200 * 24 * HOUR_MS),
        })
        const withDeadline = await seedDriver(database)
        const withoutDeadline = await seedDriver(database)
        const ids = await seedNotes(database, {
          companyId: COMPANY_ID,
          count: 4,
          emitterTaxId: ISSUER_TAX_ID,
        })
        const [lateA, missingA, lateB, missingB] = ids as [string, string, string, string]
        const trip = await seedTripWithNotes(database, { companyId: COMPANY_ID, documentIds: ids })
        await seedArrival(database, {
          arrivedAt: ARRIVED_TUESDAY,
          companyId: COMPANY_ID,
          contractorId: tenants.contractorId,
          deadlineBusinessDays: 1,
          documentIds: [lateA, missingA],
        })
        const tripDocumentOf = (nfeDocumentId: string) =>
          trip.tripDocumentIds.get(nfeDocumentId) ?? ''
        const base = { stopId: trip.stopId, tripId: trip.tripId }
        await deliver(database, {
          ...base,
          deliveredAgoMs: LATE_PHOTO_DELIVERED_AGO_MS,
          driver: withDeadline,
          isLatePhoto: true,
          tripDocumentId: tripDocumentOf(lateA),
        })
        await deliver(database, {
          ...base,
          deliveredAgoMs: MISSING_PHOTO_DELIVERED_AGO_MS,
          driver: withDeadline,
          isLatePhoto: false,
          tripDocumentId: tripDocumentOf(missingA),
        })
        await deliver(database, {
          ...base,
          deliveredAgoMs: LATE_PHOTO_DELIVERED_AGO_MS,
          driver: withoutDeadline,
          isLatePhoto: true,
          tripDocumentId: tripDocumentOf(lateB),
        })
        await deliver(database, {
          ...base,
          deliveredAgoMs: MISSING_PHOTO_DELIVERED_AGO_MS,
          driver: withoutDeadline,
          isLatePhoto: false,
          tripDocumentId: tripDocumentOf(missingB),
        })

        const read = await readDeadlines(database, {
          companyId: COMPANY_ID,
          now: NOW,
          tripId: trip.tripId,
        })
        const scores = new DrizzleDriverScoreRepository(database.db)
        const resultA = await scores.readPenalties({
          companyId: COMPANY_ID,
          driverId: withDeadline.driverId,
          now: NOW,
        })
        const resultB = await scores.readPenalties({
          companyId: COMPANY_ID,
          driverId: withoutDeadline.driverId,
          now: NOW,
        })
        const summarize = (penalties: typeof resultA.penalties) =>
          penalties.map(({ deliveredAt, points, reason }) => ({ deliveredAt, points, reason }))

        expect(read.get(lateA)?.deliveryDeadline?.state).toBe('delivered_late')
        expect(read.get(missingA)?.deliveryDeadline?.state).toBe('delivered_late')
        expect(read.get(lateB)?.deliveryDeadline).toBeNull()
        expect(read.get(missingB)?.deliveryDeadline).toBeNull()
        expect(resultA.score).toBe(85)
        expect(resultB.score).toBe(resultA.score)
        expect(summarize(resultB.penalties)).toEqual(summarize(resultA.penalties))
        expect(summarize(resultA.penalties).map(({ reason }) => reason)).toEqual([
          'missing_proof',
          'late_proof',
        ])
        expect(classifyLatePhoto()).toBe('late_and_away')
      })
    },
    60_000,
  )
})
