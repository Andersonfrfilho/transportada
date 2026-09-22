/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T7: implementação Drizzle de `AttachOccurrencePhotoUnitOfWork` — o `stored_objects` do
 * original/miniatura e a linha de `trip_document_occurrence_attachments`, na mesma transação
 * (`database.transaction`). Molde de `DrizzleSeparationOccurrenceUnitOfWork` (T6), sem a criação da
 * ocorrência — aqui ela já existe.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { storedObjects } from '../../database/storage.schema.js'
import type {
  AttachOccurrencePhotoTransactionPort,
  AttachOccurrencePhotoUnitOfWork,
  InsertOccurrenceStoredObjectInput,
} from '../application/attach-occurrence-photo.use-case.js'
import { insertOccurrenceAttachmentRow } from './drizzle-occurrence-attachment.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleAttachOccurrencePhotoUnitOfWork implements AttachOccurrencePhotoUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: AttachOccurrencePhotoTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation({
        insertAttachment: (input) => insertOccurrenceAttachmentRow(transaction, input),
        insertStoredObject: (input) => insertAttachmentStoredObject(transaction, input),
      }),
    )
  }
}

async function insertAttachmentStoredObject(
  queryable: TripQueryable,
  input: InsertOccurrenceStoredObjectInput,
): Promise<void> {
  await queryable.insert(storedObjects).values({
    bucket: 'fiscal',
    companyId: input.companyId,
    id: input.id,
    mimeType: input.mimeType,
    objectKey: input.objectKey,
    provider: 's3',
    purpose: input.purpose,
    retentionUntil: input.retentionUntil,
    sha256: input.sha256,
    sizeBytes: BigInt(input.sizeBytes),
    status: 'final',
  })
}
