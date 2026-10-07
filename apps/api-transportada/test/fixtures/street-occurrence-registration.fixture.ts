/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 Fase 1d: o registro da ocorrência de rua pelo caminho real do motorista
 * (`registerDriverOccurrence` + repositórios Drizzle), com o upload já confirmado como o app o deixa
 * (spec 179: `trip_occurrence_uploads` + objeto `trip_occurrence_attachment`).
 */
import { tripOccurrenceUploads } from '../../src/database/trip.schema.js'
import type { DriverDocumentOccurrence } from '../../src/trips/application/driver-document-occurrence.types.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import type { DriverOccurrenceItemInput } from '../../src/trips/application/register-driver-occurrence.types.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleOccurrenceAttachmentOverridesRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment-overrides.repository.js'
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

export type StreetOccurrenceRegistration = Scope & {
  readonly attachmentObjectId: string | null
  /** Spec 246 (T2.7): a lista de fotos; quando presente vale no lugar do campo único. */
  readonly attachmentObjectIds?: readonly string[]
  /** Spec 247 (T4.4): o valor pago da ocorrência, como texto. */
  readonly declaredAmount?: string
  /** Spec 246: a nota a registrar; ausente é a da viagem semeada. */
  readonly documentId?: string
  /** Spec 247 (T4.4): ausente é uma chave nova por chamada; fixa exercita o reenvio. */
  readonly idempotencyKey?: string
  /** Spec 247 (T4.4): os itens marcados, com quantidade e valor pago opcional. */
  readonly items?: readonly DriverOccurrenceItemInput[]
  /** Spec 246: ausente é `cliente ausente`; vazio exercita a observação obrigatória. */
  readonly note?: string
  readonly productCode?: string
  /** Spec 247 (T4.4): o número do documento do cliente. */
  readonly referenceNumber?: string
  readonly signatureObjectId?: string | null
  readonly typeId: string
}

/**
 * ⚠️ A porta é a mesma que `main.ts` monta para o app (`findOccurrenceTypeOverrides` incluída): é o
 * caminho real, com o contratante e o destinatário lidos **da nota** pelo banco.
 */
export function registerStreetOccurrence(
  database: TestDatabase,
  input: StreetOccurrenceRegistration,
): Promise<DriverDocumentOccurrence> {
  const uploads = new DrizzleOccurrenceUploadRepository(database.db)
  const overrides = new DrizzleOccurrenceAttachmentOverridesRepository(database.db)
  return registerDriverOccurrence({
    actorUserId: input.company.userId,
    attachmentObjectId: input.attachmentObjectId,
    ...(input.attachmentObjectIds === undefined
      ? {}
      : { attachmentObjectIds: input.attachmentObjectIds }),
    companyId: input.company.companyId,
    ...(input.declaredAmount === undefined ? {} : { declaredAmount: input.declaredAmount }),
    documentId: input.documentId ?? input.trip.documentId,
    driverId: input.company.firstDriverId,
    idempotencyKey: input.idempotencyKey ?? crypto.randomUUID(),
    ...(input.items === undefined ? {} : { items: input.items }),
    note: input.note ?? 'cliente ausente',
    occurrenceTypeId: input.typeId,
    productCode: input.productCode ?? '',
    ...(input.referenceNumber === undefined ? {} : { referenceNumber: input.referenceNumber }),
    repository: {
      findConfirmedUpload: (query) => uploads.findConfirmedUpload(query),
      findOccurrenceType: (query) => findOccurrenceType(database.db, query),
      findOccurrenceTypeOverrides: (query) =>
        overrides.listOverridesForTypes({
          companyId: query.companyId,
          occurrenceTypeIds: [query.occurrenceTypeId],
        }),
      findReachableDocument: (query) => findDriverReachableDocument(database.db, query),
      listDocumentProducts: (query) => listDocumentProducts(database.db, query),
    },
    signatureObjectId: input.signatureObjectId ?? null,
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
