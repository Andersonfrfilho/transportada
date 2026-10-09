/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (CA16), contra Postgres real: o feriado avisa o motorista, nunca o mede. O mesmo motorista, com
 * as mesmas notas entregues (uma com a foto tarde, outra sem foto), lido ANTES e DEPOIS de a empresa cadastrar
 * feriado em todos os dias da história: a nota (`score`), as penalidades, a pontualidade do comprovante e as
 * fotos pendentes (`missingAfterHours`) não mudam um ponto — só o aviso da parada aberta aparece. Molde:
 * `delivery-deadline-driver-independence`.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { DrizzleHolidayWarningRepository } from '../../src/business-calendar/infrastructure/drizzle-holiday-warning.repository.js'
import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import {
  storedObjects,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
} from '../../src/database/database.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { classifyProofPunctuality } from '../../src/trips/domain/delivery-proof-punctuality.policy.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverStopHolidayContextRepository } from '../../src/trips/infrastructure/drizzle-driver-stop-holiday-context.repository.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  seedDriverAccount,
  seedDriverTrip,
  type SeededDriverAccount,
} from '../fixtures/driver-holiday-warning-seed.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'
import { CAMPINAS, seedTypedHoliday } from '../fixtures/trip-delivery-deadline-seed.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const COMPANY_ID = COMPANY_CONTEXT.companyId
const NOW = new Date('2026-10-20T12:00:00.000Z')
const HOUR_MS = 3_600_000
const LATE_PHOTO_DELIVERED_AGO_MS = 72 * HOUR_MS
const MISSING_PHOTO_DELIVERED_AGO_MS = 25 * HOUR_MS
const MISSING_AFTER_HOURS = 24
const HISTORY_DAYS = ['2026-10-17', '2026-10-19', '2026-10-20'] as const

async function seedDelivery(
  database: TestDatabase,
  params: {
    readonly deliveredAgoMs: number
    readonly driver: SeededDriverAccount
    readonly hasLatePhoto: boolean
    readonly nfeDocumentId: string
    readonly stopId: string
    readonly tripId: string
  },
): Promise<void> {
  const deliveredAt = new Date(NOW.getTime() - params.deliveredAgoMs)
  const [tripDocument] = await database.db
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(eq(tripDocuments.nfeDocumentId, params.nfeDocumentId))
  const tripDocumentId = tripDocument?.id ?? ''
  await database.db
    .update(tripDocuments)
    .set({ deliveredAt, separationStatus: 'delivered' })
    .where(eq(tripDocuments.id, tripDocumentId))
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
    tripDocumentId,
  })
  if (!params.hasLatePhoto) return

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

async function readDriverView(database: TestDatabase, driver: SeededDriverAccount) {
  const scores = new DrizzleDriverScoreRepository(database.db)
  const penalties = await scores.readPenalties({
    companyId: COMPANY_ID,
    driverId: driver.driverId,
    now: NOW,
  })
  const current = await findCurrentDriverTrip({
    companyId: COMPANY_ID,
    holidayWarnings: {
      calendar: new DrizzleHolidayWarningRepository(database.db),
      contexts: new DrizzleDriverStopHolidayContextRepository(database.db),
    },
    membershipId: driver.membershipId,
    now: NOW,
    repository: new DrizzleCurrentDriverTripRepository(database.db),
    scores,
  })
  return {
    penalties: penalties.penalties.map(({ deliveredAt, points, reason }) => ({
      deliveredAt,
      points,
      reason,
    })),
    pendingProofs: current.pendingProofs,
    score: current.score,
    scoreFromPenalties: penalties.score,
    warnedStopCount: current.trips
      .flatMap((trip) => trip.stops)
      .filter((stop) => stop.holidayWarnings !== undefined).length,
  }
}

describe('o feriado não mexe na nota do motorista (spec 252 T4.3, CA16)', () => {
  testWithPostgres(
    'as mesmas notas entregues, antes e depois de a empresa cadastrar feriado: mesma nota, penalidades e fotos pendentes',
    async () => {
      await withCargoDatabase(async (database) => {
        await database.db.insert(companyDeliveryProofSettings).values({
          companyId: COMPANY_ID,
          missingAfterHours: MISSING_AFTER_HOURS,
          photo: 'required',
          scoreEffectiveSince: new Date(NOW.getTime() - 200 * 24 * HOUR_MS),
        })
        const driver = await seedDriverAccount(database, COMPANY_ID)
        const seeded = await seedDriverTrip(database, {
          companyId: COMPANY_ID,
          driver,
          stops: [
            { cityCode: CAMPINAS, completedAt: NOW, estimatedArrivalAt: NOW },
            { cityCode: CAMPINAS, completedAt: NOW, estimatedArrivalAt: NOW },
            { cityCode: CAMPINAS, estimatedArrivalAt: NOW },
          ],
        })
        const [lateStop, missingStop] = seeded.stopIds as [string, string, string]
        const [lateNote, missingNote] = seeded.documentIds.flat() as [string, string]
        const base = { driver, tripId: seeded.tripId }
        await seedDelivery(database, {
          ...base,
          deliveredAgoMs: LATE_PHOTO_DELIVERED_AGO_MS,
          hasLatePhoto: true,
          nfeDocumentId: lateNote,
          stopId: lateStop,
        })
        await seedDelivery(database, {
          ...base,
          deliveredAgoMs: MISSING_PHOTO_DELIVERED_AGO_MS,
          hasLatePhoto: false,
          nfeDocumentId: missingNote,
          stopId: missingStop,
        })

        const before = await readDriverView(database, driver)
        for (const holidayOn of HISTORY_DAYS) {
          await seedTypedHoliday(database, {
            cityIbgeCode: CAMPINAS,
            companyId: COMPANY_ID,
            holidayOn,
          })
        }
        const after = await readDriverView(database, driver)

        expect(before.warnedStopCount).toBe(0)
        expect(after.warnedStopCount).toBe(1)
        expect(before.score).toBe(85)
        expect(after.score).toBe(before.score)
        expect(after.scoreFromPenalties).toBe(before.scoreFromPenalties)
        expect(after.penalties).toEqual(before.penalties)
        expect(before.penalties.map(({ reason }) => reason)).toEqual([
          'missing_proof',
          'late_proof',
        ])
        expect(before.pendingProofs.length).toBeGreaterThan(0)
        expect(after.pendingProofs).toEqual(before.pendingProofs)
        expect(classifyLatePhoto()).toBe('late_and_away')
      })
    },
    60_000,
  )
})
