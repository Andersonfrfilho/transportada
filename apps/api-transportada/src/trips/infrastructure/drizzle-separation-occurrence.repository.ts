/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T6: implementação Drizzle de `SeparationOccurrenceUnitOfWork` — a ocorrência de galpão,
 * os `stored_objects` do original/miniatura e a linha de `trip_document_occurrence_attachments`,
 * todos numa transação só (`database.transaction`).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { storedObjects } from '../../database/storage.schema.js'
import type {
  InsertStoredObjectInput,
  SeparationOccurrenceSaveInput,
  SeparationOccurrenceTransactionPort,
  SeparationOccurrenceUnitOfWork,
} from '../application/persist-separation-occurrence-attachment.service.js'
import type { TripOccurrence } from '../application/register-trip-occurrence.use-case.js'
import { saveTripOccurrence } from './delivery-proof-read.support.js'
import { insertOccurrenceAttachmentRow } from './drizzle-occurrence-attachment.repository.js'
import { insertOccurrenceProductRows } from './drizzle-occurrence-product.repository.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleSeparationOccurrenceUnitOfWork implements SeparationOccurrenceUnitOfWork {
  public constructor(
    private readonly database: Database,
    private readonly bucket: string,
  ) {}

  public execute<TResult>(
    operation: (transaction: SeparationOccurrenceTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation({
        insertAttachment: (input) => insertOccurrenceAttachmentRow(transaction, input),
        insertOccurrenceProducts: (input) => insertOccurrenceProductRows(transaction, input),
        insertStoredObject: (input) =>
          insertSeparationStoredObject(transaction, input, this.bucket),
        saveOccurrence: (input) => saveSeparationOccurrence(transaction, input),
      }),
    )
  }
}

async function insertSeparationStoredObject(
  queryable: TripQueryable,
  input: InsertStoredObjectInput,
  bucket: string,
): Promise<void> {
  await queryable.insert(storedObjects).values({
    bucket,
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

/**
 * D6: o galpão nunca escreve `attachment_object_id` — só a coluna antiga (ocorrência de rua) usa
 * esse caminho. `saveTripOccurrence` recebe `attachmentObjectId: undefined`, que grava `null`.
 */
async function saveSeparationOccurrence(
  queryable: TripQueryable,
  input: SeparationOccurrenceSaveInput,
): Promise<null | TripOccurrence> {
  return saveTripOccurrence(queryable, {
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    documentId: input.documentId,
    note: input.note,
    occurrenceTypeId: input.occurrenceTypeId,
    productCode: input.productCode,
    stage: input.stage,
    tripId: input.tripId,
    typeName: input.typeName,
  })
}
