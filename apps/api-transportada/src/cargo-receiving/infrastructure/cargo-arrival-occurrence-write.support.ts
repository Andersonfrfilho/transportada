/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9.1, R4): a ocorrência de recebimento grava na mesma tabela da de galpão,
 * dona pela nota da chegada, canal `backoffice` sem motorista nem posição; itens, tratativa (164),
 * trilha da chegada, auditoria e chave de idempotência na MESMA transação.
 */
import { cargoArrivalEvents } from '../../database/cargo-arrival-event.schema.js'
import { idempotencyRecords } from '../../database/fiscal-operation.schema.js'
import { findPostgresError } from '../../database/postgres-error.support.js'
import { storedObjects } from '../../database/storage.schema.js'
import { TRIP_FIELD_CHANNELS, tripDocumentOccurrences } from '../../database/trip.schema.js'
import { CARGO_ARRIVAL_EVENT_KIND } from '../../shared/cargo-arrival.constant.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import { openOccurrenceCase } from '../../trips/infrastructure/drizzle-occurrence-case.repository.js'
import { insertOccurrenceProductRows } from '../../trips/infrastructure/drizzle-occurrence-product.repository.js'
import type {
  ArrivalScope,
  SaveCargoArrivalOccurrenceInput,
  StoreOccurrenceObjectInput,
} from '../application/cargo-arrival-occurrence.port.js'
import {
  CargoArrivalOccurrenceKeyReusedError,
  CargoArrivalOccurrenceNotSavedError,
} from '../domain/cargo-arrival-occurrence.error.js'
import { insertArrivalAudit, type Transaction } from './cargo-arrival-persistence.support.js'

export const CARGO_ARRIVAL_OCCURRENCE_OPERATION = 'cargo-arrival-occurrence'
const IDEMPOTENCY_UNIQUE = 'idempotency_records_company_id_operation_idempotency_key_unique'
const REGISTERED_AUDIT_ACTION = 'cargo-arrival.occurrence-registered'
const SUCCEEDED_STATUS = 'succeeded'
const STORAGE_PROVIDER = 's3'
const FINAL_OBJECT_STATUS = 'final'

/** A mesma chave noutra chegada não serializa na trava desta: o unique decide, e é reuso (409). */
async function saveIdempotencyRecord(
  transaction: Transaction,
  input: ArrivalScope & SaveCargoArrivalOccurrenceInput,
): Promise<void> {
  try {
    await transaction.insert(idempotencyRecords).values({
      companyId: input.companyId,
      idempotencyKey: input.idempotencyKey,
      operation: CARGO_ARRIVAL_OCCURRENCE_OPERATION,
      requestFingerprint: input.fingerprint,
      response: { occurrenceId: input.occurrenceId },
      status: SUCCEEDED_STATUS,
    })
  } catch (error) {
    if (findPostgresError({ error })?.constraint === IDEMPOTENCY_UNIQUE) {
      throw new CargoArrivalOccurrenceKeyReusedError()
    }
    throw error
  }
}

async function recordOccurrenceTrail(
  transaction: Transaction,
  input: ArrivalScope & SaveCargoArrivalOccurrenceInput,
): Promise<void> {
  await transaction.insert(cargoArrivalEvents).values({
    actorUserId: input.actorUserId,
    arrivalDocumentId: input.arrivalDocumentId,
    arrivalId: input.arrivalId,
    channel: input.channel,
    companyId: input.companyId,
    details: { occurrenceId: input.occurrenceId, occurrenceTypeId: input.occurrenceType.id },
    kind: CARGO_ARRIVAL_EVENT_KIND.occurrenceRegistered,
    occurredAt: input.now,
  })
  await insertArrivalAudit(transaction, {
    action: REGISTERED_AUDIT_ACTION,
    actorUserId: input.actorUserId,
    arrivalId: input.arrivalId,
    companyId: input.companyId,
    contractorId: input.contractorId,
    correlationId: input.correlationId,
    metadata: { arrivalDocumentId: input.arrivalDocumentId, occurrenceId: input.occurrenceId },
  })
}

export async function saveCargoArrivalOccurrence(
  transaction: Transaction,
  input: ArrivalScope & SaveCargoArrivalOccurrenceInput,
): Promise<{ readonly id: string }> {
  const [saved] = await transaction
    .insert(tripDocumentOccurrences)
    .values({
      actorUserId: input.actorUserId,
      cargoArrivalDocumentId: input.arrivalDocumentId,
      channel: TRIP_FIELD_CHANNELS.backoffice,
      companyId: input.companyId,
      id: input.occurrenceId,
      note: input.note,
      occurrenceTypeId: input.occurrenceType.id,
      productCode: input.productCode,
      stage: TRIP_OCCURRENCE_STAGE.receiving,
    })
    .returning({ id: tripDocumentOccurrences.id })
  if (saved === undefined) throw new CargoArrivalOccurrenceNotSavedError()
  const occurrenceId = saved.id
  await insertOccurrenceProductRows(transaction, {
    companyId: input.companyId,
    items: input.items,
    occurrenceId,
  })
  await openOccurrenceCase(transaction, {
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    occurrenceId,
    redeliveryPolicy: input.occurrenceType.redeliveryPolicy,
  })
  await recordOccurrenceTrail(transaction, input)
  await saveIdempotencyRecord(transaction, input)
  return { id: occurrenceId }
}

export async function insertCargoArrivalOccurrenceObject(
  transaction: Transaction,
  input: StoreOccurrenceObjectInput & { readonly bucket: string; readonly companyId: string },
): Promise<void> {
  await transaction.insert(storedObjects).values({
    bucket: input.bucket,
    companyId: input.companyId,
    id: input.id,
    mimeType: input.mimeType,
    objectKey: input.objectKey,
    provider: STORAGE_PROVIDER,
    purpose: input.purpose,
    retentionUntil: input.retentionUntil,
    sha256: input.sha256,
    sizeBytes: BigInt(input.sizeBytes),
    status: FINAL_OBJECT_STATUS,
  })
}
