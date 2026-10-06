/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 Fase 1d: as sementes da foto da ocorrência de rua — o objeto, a ocorrência com ou sem a
 * coluna antiga (`attachment_object_id`) e as linhas de `trip_document_occurrence_attachments` —,
 * gravadas direto na tabela, sem caso de uso: é o dado que já existe em produção que se quer imitar.
 */
import { storedObjects } from '../../src/database/database.schema.js'
import type { StorageObjectPurpose } from '../../src/database/storage.schema.js'
import {
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrences,
} from '../../src/database/trip.schema.js'
import type { Company, SeededTrip, TestDatabase } from './trip-field-office-database.fixture.js'

export const STREET_PHOTO_PURPOSE: StorageObjectPurpose = 'trip_occurrence_attachment'
export const BATCH_PHOTO_PURPOSE: StorageObjectPurpose = 'delivery_proof'

export async function seedPhotoObject(
  database: TestDatabase,
  input: { readonly company: Company; readonly purpose: StorageObjectPurpose },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: 'transportada',
    companyId: input.company.companyId,
    id,
    mimeType: 'image/jpeg',
    objectKey: `tenants/${input.company.companyId}/occurrence-photos/${id}`,
    provider: 's3',
    purpose: input.purpose,
    retentionUntil: new Date('2031-09-21T00:00:00.000Z'),
    sha256: id.replaceAll('-', '').padEnd(64, '0'),
    sizeBytes: 10n,
    status: 'final',
  })
  return id
}

export async function seedDocumentOccurrence(
  database: TestDatabase,
  input: {
    readonly attachmentObjectId: string | null
    readonly company: Company
    readonly createdAt: Date
    readonly stage: 'delivery' | 'separation'
    readonly trip: SeededTrip
    readonly typeId: string
  },
): Promise<string> {
  const [occurrence] = await database.db
    .insert(tripDocumentOccurrences)
    .values({
      actorUserId: input.company.userId,
      attachmentObjectId: input.attachmentObjectId,
      companyId: input.company.companyId,
      createdAt: input.createdAt,
      note: 'ocorrência gravada antes da Fase 1d',
      occurrenceTypeId: input.typeId,
      productCode: '',
      stage: input.stage,
      tripDocumentId: input.trip.documentId,
    })
    .returning({ id: tripDocumentOccurrences.id })
  if (occurrence === undefined) throw new Error('occurrence not saved')
  return occurrence.id
}

export async function seedAttachmentRow(
  database: TestDatabase,
  input: {
    readonly company: Company
    readonly createdAt: Date
    readonly occurrenceId: string
    readonly position: number
    readonly storedObjectId: string
  },
): Promise<string> {
  const [row] = await database.db
    .insert(tripDocumentOccurrenceAttachments)
    .values({
      companyId: input.company.companyId,
      createdAt: input.createdAt,
      occurrenceId: input.occurrenceId,
      position: input.position,
      storedObjectId: input.storedObjectId,
    })
    .returning({ id: tripDocumentOccurrenceAttachments.id })
  if (row === undefined) throw new Error('attachment row not saved')
  return row.id
}
