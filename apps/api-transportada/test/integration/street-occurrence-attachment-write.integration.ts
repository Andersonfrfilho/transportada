/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T1d.5 (RF1d), contra Postgres real: a escrita da ocorrência de rua grava a foto **nas
 * duas** fontes — a coluna `attachment_object_id` (a leitura antiga) e a linha de
 * `trip_document_occurrence_attachments` (posição 1, sem miniatura, com a hora da ocorrência) — até a
 * leitura nova estar em produção. O lote do escritório reaproveita o próprio objeto `delivery_proof`:
 * nenhum objeto `trip_occurrence_attachment` nasce por ele.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { storedObjects } from '../../src/database/database.schema.js'
import type { StorageObjectPurpose } from '../../src/database/storage.schema.js'
import {
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
} from '../../src/database/trip.schema.js'
import {
  BATCH_PHOTO_PURPOSE,
  STREET_PHOTO_PURPOSE,
} from '../fixtures/street-occurrence-attachment.fixture.js'
import {
  registerStreetOccurrence,
  registerStreetOccurrenceWithPhoto,
} from '../fixtures/street-occurrence-registration.fixture.js'
import {
  fakeContext,
  JPEG_BYTES,
  multipartRequest,
  seedCompany,
  seedDeliveryOccurrenceType,
  seedDispatchSnapshot,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
  wireOccurrenceRoute,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type { Company, TestDatabase } from '../fixtures/trip-field-office-database.fixture.js'

/** A coluna e as linhas de cada ocorrência da empresa, na forma que a T1d.5 promete. */
async function readBothSources(database: TestDatabase, company: Company) {
  const occurrences = await database.db
    .select({
      attachmentObjectId: tripDocumentOccurrences.attachmentObjectId,
      createdAt: tripDocumentOccurrences.createdAt,
      id: tripDocumentOccurrences.id,
    })
    .from(tripDocumentOccurrences)
    .where(eq(tripDocumentOccurrences.companyId, company.companyId))
  const rows = await database.db
    .select({
      createdAt: tripDocumentOccurrenceAttachments.createdAt,
      occurrenceId: tripDocumentOccurrenceAttachments.occurrenceId,
      position: tripDocumentOccurrenceAttachments.position,
      storedObjectId: tripDocumentOccurrenceAttachments.storedObjectId,
      thumbnailObjectId: tripDocumentOccurrenceAttachments.thumbnailObjectId,
    })
    .from(tripDocumentOccurrenceAttachments)
    .where(eq(tripDocumentOccurrenceAttachments.companyId, company.companyId))
  return { occurrences, rows }
}

type Sources = Awaited<ReturnType<typeof readBothSources>>

function expectMirrored(sources: Sources, input: { ids: readonly string[]; objectId: string }) {
  const mirrored = sources.occurrences.filter((occurrence) => input.ids.includes(occurrence.id))
  expect(mirrored).toHaveLength(input.ids.length)
  for (const occurrence of mirrored) {
    expect(occurrence.attachmentObjectId).toBe(input.objectId)
    expect(sources.rows.filter((row) => row.occurrenceId === occurrence.id)).toEqual([
      {
        createdAt: occurrence.createdAt,
        occurrenceId: occurrence.id,
        position: 1,
        storedObjectId: input.objectId,
        thumbnailObjectId: null,
      },
    ])
  }
}

async function countObjects(
  database: TestDatabase,
  company: Company,
  purpose: StorageObjectPurpose,
) {
  const objects = await database.db
    .select({ id: storedObjects.id })
    .from(storedObjects)
    .where(and(eq(storedObjects.companyId, company.companyId), eq(storedObjects.purpose, purpose)))
  return objects.map((object) => object.id)
}

describe('a foto da ocorrência de rua é gravada nas duas fontes (spec 246 T1d.5)', () => {
  testWithPostgres('motorista com upload: coluna e linha; sem foto, nenhuma linha', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      const withPhoto = await registerStreetOccurrenceWithPhoto(database, { company, trip })
      const withoutPhoto = await registerStreetOccurrence(database, {
        attachmentObjectId: null,
        company,
        trip,
        typeId: withPhoto.typeId,
      })

      const sources = await readBothSources(database, company)
      expectMirrored(sources, { ids: [withPhoto.occurrenceId], objectId: withPhoto.objectId })
      expect(sources.rows.map((row) => row.occurrenceId)).not.toContain(withoutPhoto.id)
      expect(sources.rows).toHaveLength(1)
    })
  })

  testWithPostgres('lote do escritório: o mesmo objeto do lote, uma linha por nota', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      await seedDispatchSnapshot(database, company, trip, new Date('2026-09-18T06:30:00.000Z'))
      const extraDocument = await seedExtraDocument(database, company, trip, {
        separationStatus: 'loaded',
        stopId: trip.stopId,
      })
      const typeId = await seedDeliveryOccurrenceType(database, company)
      const { route } = wireOccurrenceRoute(database)

      const response = await route.execute({
        context: fakeContext(company),
        correlationId: 'street-photo-batch',
        pathParameters: { id: trip.tripId },
        request: multipartRequest({
          fields: {
            documentIds: [trip.documentId, extraDocument],
            note: 'Cliente ausente',
            occurrenceTypeId: typeId,
          },
          file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
          idempotencyKey: 'lote-foto-de-rua',
        }),
      })
      expect(response.status).toBe(201)

      const batchObjects = await countObjects(database, company, BATCH_PHOTO_PURPOSE)
      expect(batchObjects).toHaveLength(1)
      expect(await countObjects(database, company, STREET_PHOTO_PURPOSE)).toHaveLength(0)
      const sources = await readBothSources(database, company)
      expect(sources.rows).toHaveLength(2)
      expectMirrored(sources, {
        ids: sources.occurrences.map((occurrence) => occurrence.id),
        objectId: batchObjects[0] ?? 'missing',
      })
    })
  })
})
