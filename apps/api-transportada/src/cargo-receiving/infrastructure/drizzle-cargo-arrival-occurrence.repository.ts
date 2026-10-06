/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: a transação da ocorrência de recebimento — cada método já preso à empresa e à
 * chegada do contexto. A trava, a chave, a nota, o tipo e os itens são lidos nela; o caso de uso
 * decide a ordem (`register-cargo-arrival-occurrence.use-case.ts`).
 */
import { and, asc, eq } from 'drizzle-orm'

import { idempotencyRecords } from '../../database/fiscal-operation.schema.js'
import { nfeProducts } from '../../database/nfe.schema.js'
import { companyOccurrenceTypes } from '../../database/trip.schema.js'
import { insertOccurrenceAttachmentRow } from '../../trips/infrastructure/drizzle-occurrence-attachment.repository.js'
import type {
  ArrivalScope,
  CargoArrivalOccurrenceTransactionPort,
  CargoArrivalOccurrenceUnitOfWork,
  DocumentProduct,
} from '../application/cargo-arrival-occurrence.port.js'
import type { ReceivingOccurrenceType } from '../application/cargo-arrival-occurrence.types.js'
import {
  lockOccurrenceArrival,
  lockOccurrenceDocument,
} from './cargo-arrival-occurrence-lock.support.js'
import {
  CARGO_ARRIVAL_OCCURRENCE_OPERATION,
  insertCargoArrivalOccurrenceObject,
  saveCargoArrivalOccurrence,
} from './cargo-arrival-occurrence-write.support.js'
import type { Database, Transaction } from './cargo-arrival-persistence.support.js'

type Scoped = { readonly scope: ArrivalScope; readonly transaction: Transaction }

/** A resposta guardada é entrada do banco: só um `occurrenceId` texto vale como reenvio. */
function readStoredOccurrenceId(response: unknown): string | null {
  if (typeof response !== 'object' || response === null || !('occurrenceId' in response)) {
    return null
  }
  return typeof response.occurrenceId === 'string' ? response.occurrenceId : null
}

async function findReplay({
  idempotencyKey,
  scope,
  transaction,
}: Scoped & { readonly idempotencyKey: string }): Promise<{
  readonly fingerprint: string
  readonly occurrenceId: string
} | null> {
  const [row] = await transaction
    .select({
      fingerprint: idempotencyRecords.requestFingerprint,
      response: idempotencyRecords.response,
    })
    .from(idempotencyRecords)
    .where(
      and(
        eq(idempotencyRecords.companyId, scope.companyId),
        eq(idempotencyRecords.operation, CARGO_ARRIVAL_OCCURRENCE_OPERATION),
        eq(idempotencyRecords.idempotencyKey, idempotencyKey),
      ),
    )
  if (row === undefined) return null
  const occurrenceId = readStoredOccurrenceId(row.response)
  if (occurrenceId === null) throw new Error('CARGO_ARRIVAL_OCCURRENCE_REPLAY_UNREADABLE')
  return { fingerprint: row.fingerprint, occurrenceId }
}

async function findOccurrenceType({
  occurrenceTypeId,
  scope,
  transaction,
}: Scoped & { readonly occurrenceTypeId: string }): Promise<ReceivingOccurrenceType | null> {
  const [row] = await transaction
    .select({
      active: companyOccurrenceTypes.active,
      allowsMultipleItems: companyOccurrenceTypes.allowsMultipleItems,
      id: companyOccurrenceTypes.id,
      itemsMode: companyOccurrenceTypes.itemsMode,
      name: companyOccurrenceTypes.name,
      redeliveryPolicy: companyOccurrenceTypes.redeliveryPolicy,
      stage: companyOccurrenceTypes.stage,
    })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, scope.companyId),
        eq(companyOccurrenceTypes.id, occurrenceTypeId),
      ),
    )
  return row ?? null
}

function listDocumentProducts({
  nfeDocumentId,
  scope,
  transaction,
}: Scoped & { readonly nfeDocumentId: string }): Promise<readonly DocumentProduct[]> {
  return transaction
    .select({
      code: nfeProducts.code,
      commercialUnit: nfeProducts.commercialUnit,
      description: nfeProducts.description,
    })
    .from(nfeProducts)
    .where(
      and(eq(nfeProducts.companyId, scope.companyId), eq(nfeProducts.documentId, nfeDocumentId)),
    )
    .orderBy(asc(nfeProducts.ordinal))
}

function createTransactionPort(
  scoped: Scoped & { readonly bucket: string },
): CargoArrivalOccurrenceTransactionPort {
  const { bucket, scope, transaction } = scoped
  return {
    findOccurrenceType: (occurrenceTypeId) => findOccurrenceType({ ...scoped, occurrenceTypeId }),
    findReplay: (idempotencyKey) => findReplay({ ...scoped, idempotencyKey }),
    async insertAttachment(input) {
      await insertOccurrenceAttachmentRow(transaction, { ...input, companyId: scope.companyId })
    },
    insertStoredObject: (input) =>
      insertCargoArrivalOccurrenceObject(transaction, {
        ...input,
        bucket,
        companyId: scope.companyId,
      }),
    listDocumentProducts: (nfeDocumentId) => listDocumentProducts({ ...scoped, nfeDocumentId }),
    lockArrival: () => lockOccurrenceArrival(transaction, scope),
    lockDocument: (nfeDocumentId) =>
      lockOccurrenceDocument(transaction, { ...scope, nfeDocumentId }),
    saveOccurrence: (input) => saveCargoArrivalOccurrence(transaction, { ...scope, ...input }),
  }
}

export class DrizzleCargoArrivalOccurrenceUnitOfWork implements CargoArrivalOccurrenceUnitOfWork {
  public constructor(
    private readonly database: Database,
    private readonly bucket: string,
  ) {}

  public execute<TResult>({
    operation,
    scope,
  }: {
    readonly operation: (transaction: CargoArrivalOccurrenceTransactionPort) => Promise<TResult>
    readonly scope: ArrivalScope
  }): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(createTransactionPort({ bucket: this.bucket, scope, transaction })),
    )
  }
}
