/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 Fase 1d: o registro da ocorrência de rua pelo caminho real do motorista
 * (`registerDriverOccurrence` + repositórios Drizzle), com o upload já confirmado como o app o deixa
 * (spec 179: `trip_occurrence_uploads` + objeto `trip_occurrence_attachment`).
 */
import { tripOccurrenceUploads } from '../../src/database/trip.schema.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleOccurrenceUploadRepository } from '../../src/trips/infrastructure/drizzle-occurrence-upload.repository.js'
import { seedPhotoObject, STREET_PHOTO_PURPOSE } from './street-occurrence-attachment.fixture.js'
import { seedDeliveryOccurrenceType } from './trip-field-office-database.fixture.js'
import type { Company, SeededTrip, TestDatabase } from './trip-field-office-database.fixture.js'

type Scope = { readonly company: Company; readonly trip: SeededTrip }

export async function seedConfirmedUpload(database: TestDatabase, scope: Scope): Promise<string> {
  const objectId = await seedPhotoObject(database, {
    company: scope.company,
    purpose: STREET_PHOTO_PURPOSE,
  })
  await database.db.insert(tripOccurrenceUploads).values({
    bucket: 'transportada',
    companyId: scope.company.companyId,
    confirmedAt: new Date('2026-09-18T09:00:00.000Z'),
    declaredSizeBytes: 10n,
    driverId: scope.company.firstDriverId,
    expiresAt: new Date('2026-09-19T00:00:00.000Z'),
    id: objectId,
    mimeType: 'image/jpeg',
    objectKey: `tenants/${scope.company.companyId}/occurrence-photos/${objectId}`,
    status: 'confirmed',
    tripId: scope.trip.tripId,
  })
  return objectId
}

export function registerStreetOccurrence(
  database: TestDatabase,
  input: Scope & { readonly attachmentObjectId: string | null; readonly typeId: string },
): Promise<{ readonly id: string }> {
  const uploads = new DrizzleOccurrenceUploadRepository(database.db)
  return registerDriverOccurrence({
    actorUserId: input.company.userId,
    attachmentObjectId: input.attachmentObjectId,
    companyId: input.company.companyId,
    documentId: input.trip.documentId,
    driverId: input.company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    note: 'cliente ausente',
    occurrenceTypeId: input.typeId,
    productCode: '',
    repository: {
      findConfirmedUpload: (query) => uploads.findConfirmedUpload(query),
      findOccurrenceType: (query) => findOccurrenceType(database.db, query),
      findReachableDocument: (query) => findDriverReachableDocument(database.db, query),
      listDocumentProducts: (query) => listDocumentProducts(database.db, query),
    },
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
  })
}

/** Tipo de rua, upload confirmado e o registro com a foto: devolve a ocorrência e a chave do objeto. */
export async function registerStreetOccurrenceWithPhoto(database: TestDatabase, scope: Scope) {
  const typeId = await seedDeliveryOccurrenceType(database, scope.company)
  const objectId = await seedConfirmedUpload(database, scope)
  const saved = await registerStreetOccurrence(database, {
    ...scope,
    attachmentObjectId: objectId,
    typeId,
  })
  return {
    objectId,
    objectKey: `tenants/${scope.company.companyId}/occurrence-photos/${objectId}`,
    occurrenceId: saved.id,
    typeId,
  }
}
