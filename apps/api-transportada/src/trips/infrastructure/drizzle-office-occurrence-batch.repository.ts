/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNull } from 'drizzle-orm'

import { storedObjects } from '../../database/storage.schema.js'
import { tripDocumentOccurrences, tripDocuments, trips } from '../../database/trip.schema.js'
import type { FieldTripTarget } from '../application/field-trip-target.types.js'
import type {
  OfficeOccurrenceBatchTransactionPort,
  OfficeOccurrenceBatchUnitOfWork,
} from '../application/register-office-document-occurrences.use-case.js'
import { findOccurrenceType, saveTripOccurrence } from './delivery-proof-read.support.js'
import { PROOF_REACHABLE_TRIP_STATUSES } from './drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportTransaction } from './drizzle-driver-field-report.repository.js'
import { fieldTripTargetCondition } from './field-trip-target.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Spec 156 T7.3: o lote de ocorrências numa transação só. A reserva e a liquidação da chave são as
 * mesmas do relato de campo (`DrizzleDriverFieldReportTransaction`); as consultas usam a mesma
 * transação, então o lote inteiro confirma ou desfaz junto.
 */
export class DrizzleOfficeOccurrenceBatchUnitOfWork implements OfficeOccurrenceBatchUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: OfficeOccurrenceBatchTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) => {
      const fieldReports = new DrizzleDriverFieldReportTransaction(transaction)
      return operation({
        claim: (input) => fieldReports.claim(input),
        findDocumentOccurrence: (input) => findDocumentOccurrence(transaction, input),
        findOccurrenceType: (input) => findOccurrenceType(transaction, input),
        findReachableDocumentIds: (input) => findReachableDocumentIds(transaction, input),
        recordOfficeAudit: (input) => fieldReports.recordOfficeAudit(input),
        saveAttachmentObject: (input) => saveOccurrenceAttachmentObject(transaction, input),
        saveDocumentOccurrence: (input) => saveTripOccurrence(transaction, input),
        settle: (input) => fieldReports.settle(input),
      })
    })
  }
}

/**
 * O mesmo recorte de `findDriverReachableDocument` — o alvo e a viagem despachada —, para várias
 * notas numa consulta, e só as vivas: nota liberada não está mais na viagem.
 */
export async function findReachableDocumentIds(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
    readonly target: FieldTripTarget
  },
): Promise<readonly string[]> {
  const rows = await queryable
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(tripDocuments.id, [...input.documentIds]),
        isNull(tripDocuments.releasedAt),
        fieldTripTargetCondition(input.target),
        inArray(trips.status, [...PROOF_REACHABLE_TRIP_STATUSES]),
      ),
    )

  return rows.map((row) => row.id)
}

export async function findDocumentOccurrence(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<null | { readonly documentId: string; readonly id: string }> {
  const [row] = await queryable
    .select({ documentId: tripDocumentOccurrences.tripDocumentId, id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
    .limit(1)

  return row ?? null
}

/**
 * Spec 156 T7b (D7 §3.5): a foto do lote, no molde de `saveDeliveryProofWithinTransaction` — o
 * mesmo objeto acaba referenciado por N linhas de `trip_document_occurrences`, então esta escrita
 * acontece **uma vez** por lote, antes do laço por nota (`performBatch`).
 */
export async function saveOccurrenceAttachmentObject(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly sha256: string
    readonly sizeBytes: number
  },
): Promise<void> {
  await queryable.insert(storedObjects).values({
    bucket: 'fiscal',
    companyId: input.companyId,
    id: input.objectId,
    mimeType: input.mimeType,
    objectKey: input.objectKey,
    provider: 's3',
    purpose: 'delivery_proof',
    sha256: input.sha256,
    sizeBytes: BigInt(input.sizeBytes),
    status: 'final',
  })
}
