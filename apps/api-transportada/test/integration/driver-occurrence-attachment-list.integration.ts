/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T2.7 (lacuna achada na 1d, RF1c, RF8), contra Postgres real: o motorista registra a
 * ocorrência de nota com **várias** fotos. Um tipo com `photo_minimum_count = 3` passa a ser
 * registrável; as fotos viram as linhas 1..N de `trip_document_occurrence_attachments` (na ordem, com
 * a hora da ocorrência) e a coluna antiga leva a primeira; abaixo do mínimo é recusado sem gravar; e
 * cada objeto tem de ser do motorista que registra.
 */
import { describe, expect } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import {
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
  tripOccurrenceUploads,
} from '../../src/database/trip.schema.js'
import {
  TripOccurrencePhotoMinimumNotMetError,
  TripOccurrenceUploadNotReachableError,
} from '../../src/trips/domain/trip.error.js'
import { saveOccurrenceType } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import {
  registerStreetOccurrence,
  seedConfirmedUpload,
} from '../fixtures/street-occurrence-registration.fixture.js'
import {
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

describe('a ocorrência de nota guarda N fotos (spec 246 T2.7)', () => {
  testWithPostgres(
    'três fotos num tipo que exige três: linhas 1..3 na ordem, coluna com a primeira',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const type = await saveOccurrenceType(database.db, {
          active: true,
          attachmentMode: 'required',
          companyId: company.companyId,
          emailBody: '',
          emailSubject: '',
          emailTemplateKey: null,
          flow: 'document',
          name: 'Recusa total',
          notifies: false,
          occurrenceTypeId: null,
          photoMinimumCount: 3,
          stage: 'delivery',
        })
        const first = await seedConfirmedUpload(database, { company, trip })
        const second = await seedConfirmedUpload(database, { company, trip })
        const third = await seedConfirmedUpload(database, { company, trip })
        const uploads = [first, second, third]

        const tooFew = await rejection(
          registerStreetOccurrence(database, {
            attachmentObjectId: null,
            attachmentObjectIds: uploads.slice(0, 2),
            company,
            trip,
            typeId: type.id,
          }),
        )
        expect(tooFew).toBeInstanceOf(TripOccurrencePhotoMinimumNotMetError)
        expect(
          await database.db
            .select({ id: tripDocumentOccurrences.id })
            .from(tripDocumentOccurrences)
            .where(eq(tripDocumentOccurrences.companyId, company.companyId)),
        ).toHaveLength(0)

        const saved = await registerStreetOccurrence(database, {
          attachmentObjectId: null,
          attachmentObjectIds: uploads,
          company,
          trip,
          typeId: type.id,
        })

        const [occurrence] = await database.db
          .select({
            attachmentObjectId: tripDocumentOccurrences.attachmentObjectId,
            createdAt: tripDocumentOccurrences.createdAt,
          })
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.id, saved.id))
        const rows = await database.db
          .select({
            createdAt: tripDocumentOccurrenceAttachments.createdAt,
            position: tripDocumentOccurrenceAttachments.position,
            storedObjectId: tripDocumentOccurrenceAttachments.storedObjectId,
          })
          .from(tripDocumentOccurrenceAttachments)
          .where(eq(tripDocumentOccurrenceAttachments.occurrenceId, saved.id))
          .orderBy(asc(tripDocumentOccurrenceAttachments.position))
        expect(occurrence?.attachmentObjectId).toBe(first)
        expect(rows.map((row) => [row.position, row.storedObjectId])).toEqual([
          [1, first],
          [2, second],
          [3, third],
        ])
        expect(occurrence).toBeDefined()
        for (const row of rows) expect(row.createdAt).toEqual(occurrence?.createdAt as Date)
      })
    },
    60_000,
  )

  testWithPostgres('um objeto de outro motorista da mesma viagem é inalcançável', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const type = await saveOccurrenceType(database.db, {
        active: true,
        companyId: company.companyId,
        emailBody: '',
        emailSubject: '',
        emailTemplateKey: null,
        flow: 'document',
        name: 'Cliente ausente',
        notifies: false,
        occurrenceTypeId: null,
        stage: 'delivery',
      })
      const foreign = await seedConfirmedUpload(database, { company, trip })
      await database.db
        .update(tripOccurrenceUploads)
        .set({ driverId: company.secondDriverId })
        .where(eq(tripOccurrenceUploads.id, foreign))

      const error = await rejection(
        registerStreetOccurrence(database, {
          attachmentObjectId: foreign,
          company,
          trip,
          typeId: type.id,
        }),
      )

      expect(error).toBeInstanceOf(TripOccurrenceUploadNotReachableError)
    })
  })
})
