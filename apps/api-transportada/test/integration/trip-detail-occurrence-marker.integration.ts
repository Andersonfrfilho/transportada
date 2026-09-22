/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T15, contra Postgres real: o marcador derivado (RF20/RF21) e a regressão que a spec
 * exige — `GET /trips/:id/allowed-actions` não muda com a tratativa aberta, e a abertura da
 * tratativa não escreve em `trip_documents.separation_status`.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyOccurrenceTypes, tripDocuments } from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { readTripActionSnapshot } from '../../src/trips/infrastructure/trip-action-snapshot.query.js'
import { resolveTripAllowedActions } from '../../src/trips/domain/trip-allowed-actions.policy.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

async function seedOccurrenceType(database: TestDatabase, company: Company): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name: 'Avaria em trânsito',
    notifies: false,
    redeliveryPolicy: 'allowed',
    stage: 'separation',
  })
  return id
}

/** Abre a tratativa (`redeliveryPolicy: 'allowed'` nunca é `unset` — abre em `recorded`, RF3). */
async function registerOccurrenceOpeningCase(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  occurrenceTypeId: string,
): Promise<void> {
  const registered = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      /** Spec 166: a nota inteira, sem item apontado — nada a contar. */
      items: [],
      note: 'caixa amassada no transbordo',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'allowed',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Avaria em trânsito',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (registered === null) throw new Error('EXPECTED_OCCURRENCE')
}

describe('o marcador derivado da tratativa em readTripDetail (spec 164 T15)', () => {
  testWithPostgres(
    'openOccurrenceCase e hasOpenOccurrence nascem false e viram true com a tratativa aberta, sem tocar allowed-actions nem separation_status',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const repository = new DrizzleTripRepository(database.db)

        const detailBefore = await repository.findById({
          companyId: company.companyId,
          tripId: trip.tripId,
        })
        expect(detailBefore?.documents[0]?.openOccurrenceCase).toBe(false)
        expect(detailBefore?.stops[0]?.hasOpenOccurrence).toBe(false)

        const snapshotBefore = await readTripActionSnapshot(database.db, {
          companyId: company.companyId,
          tripId: trip.tripId,
        })
        if (snapshotBefore === null) throw new Error('EXPECTED_SNAPSHOT')
        const actionsBefore = resolveTripAllowedActions({
          capabilities: { canManage: true, canReportOnBehalf: true },
          trip: snapshotBefore,
        })

        const occurrenceTypeId = await seedOccurrenceType(database, company)
        await registerOccurrenceOpeningCase(database, company, trip, occurrenceTypeId)

        const detailAfter = await repository.findById({
          companyId: company.companyId,
          tripId: trip.tripId,
        })
        expect(detailAfter?.documents[0]?.openOccurrenceCase).toBe(true)
        expect(detailAfter?.stops[0]?.hasOpenOccurrence).toBe(true)

        const snapshotAfter = await readTripActionSnapshot(database.db, {
          companyId: company.companyId,
          tripId: trip.tripId,
        })
        if (snapshotAfter === null) throw new Error('EXPECTED_SNAPSHOT')
        const actionsAfter = resolveTripAllowedActions({
          capabilities: { canManage: true, canReportOnBehalf: true },
          trip: snapshotAfter,
        })

        // CA5/RF20/RF21: a tratativa aberta não muda uma vírgula de `allowed-actions`.
        expect(actionsAfter).toEqual(actionsBefore)

        const [documentRow] = await database.db
          .select({ separationStatus: tripDocuments.separationStatus })
          .from(tripDocuments)
          .where(eq(tripDocuments.id, trip.documentId))
          .limit(1)
        expect(documentRow?.separationStatus).toBe('loaded')
      })
    },
    30_000,
  )
})
