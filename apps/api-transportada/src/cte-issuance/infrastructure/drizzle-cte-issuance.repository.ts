/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'

import {
  cteBatchEvents,
  cteBatchItems,
  cteBatches,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuanceEvents,
  cteIssuanceOutbox,
  cteIssuancePayloads,
  cteRetrySchedules,
  cteSubmissionRecords,
  fiscalSequenceReservations,
  idempotencyRecords,
  storedObjects,
} from '../../database/database.schema.js'
import type {
  CteFiscalDocumentRecord,
  CteIssuanceCreatedAttempt,
  CteIssuanceFiscalSettings,
  CteIssuanceIssuanceRecord,
  CteIssuanceUnitOfWorkPort,
} from '../application/cte-issuance.use-case.js'
import type {
  CteIssuanceFiscalEnvironment,
  CteIssuancePayloadRecord,
  CteIssuancePayloadSource,
  CteIssuancePayloadSourceQuery,
} from '../application/cte-issuance-payload.port.js'
import { resolveIssuedDocumentStatus } from '../domain/cte-fiscal-document-status.policy.js'
import { getCteIssuanceAttemptKind, mapCteIssuanceAttempt } from './cte-issuance-attempt.mapper.js'
import { ApiError } from '../../shared/api.error.js'
import { findCteIssuanceFiscalSettings } from './cte-issuance-fiscal-settings.query.js'
import { findCteIssuancePayloadSource } from './cte-issuance-payload.query.js'
import type { CompanySettingsDatabase } from '../../companies/infrastructure/drizzle-company-settings.types.js'
import { DrizzleFiscalSequenceReservationRepository } from '../../companies/infrastructure/drizzle-fiscal-sequence-reservation.repository.js'
import type { ReserveFiscalNumberInput } from '../../companies/application/fiscal-sequence-reservation.port.js'
import type { CompanySettingsTransaction } from '../../companies/infrastructure/drizzle-company-settings.types.js'
import { reserveFiscalNumber } from '../../companies/infrastructure/drizzle-fiscal-sequence-reservation-persistence.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction

type BatchItemQuery = {
  readonly batchId: string
  readonly batchItemId?: string | undefined
  readonly companyId: string
}

type IssuanceAttemptRecord = typeof cteIssuanceAttempts.$inferSelect
type CteIssuanceAttemptStatus =
  | 'requested'
  | 'in_flight'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'
  | 'cancelled'
type CteIssuanceAttemptKind = 'issue' | 'reprocess' | 'cancel'
type CteIssuanceOutboxEventType =
  | 'transportada.cte.item.issue.requested'
  | 'transportada.cte.item.cancel.requested'
type CteIssuanceCreateAttemptInput = {
  readonly attemptKind: CteIssuanceAttemptKind
  readonly attemptNumber: number
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly correlationId: string
  readonly fiscalEnvironment: 'homologation' | 'production'
  readonly fiscalSeries: string
  readonly fiscalNumber: string
  readonly idempotencyKey: string
  readonly reservationId?: string | undefined
  readonly status: CteIssuanceAttemptStatus
  readonly issueRequestedAt: string
}
type CteIssuanceCancellationRequest = {
  readonly attemptId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly justification: string
  readonly requestedAt: string
}
type CteIssuanceOutboxCommand = {
  readonly aggregateId: string
  readonly actorUserId: string
  readonly aggregateType: 'cte_batch'
  readonly aggregateSubtype: 'item'
  readonly batchItemId: string
  readonly batchId: string
  readonly companyId: string
  readonly correlationId: string
  readonly eventType: CteIssuanceOutboxEventType
  readonly attemptKind: CteIssuanceAttemptKind
  readonly status: CteIssuanceAttemptStatus
  readonly issueId: string
  readonly attemptFingerprint: string
}
type CteIssuanceReservationRequest = {
  readonly batchItemId: string
  readonly batchId: string
  readonly companyId: string
  readonly environment: CteIssuanceFiscalEnvironment
  readonly kind: 'issue' | 'reprocess'
  readonly series: string
}
type SubmitDraftBatchInput = {
  readonly batchId: string
  readonly companyId: string
  readonly idempotencyKey: string
  readonly requestFingerprint: string
  readonly userId: string
}
type CteIssuancePersistedStatus =
  | 'in_flight'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'
  | 'cancelled'

export class DrizzleCteIssuanceRepository implements CteIssuanceUnitOfWorkPort {
  public constructor(private readonly database: Database) {
    this.fiscalSequenceReservationRepository = new DrizzleFiscalSequenceReservationRepository(
      database as CompanySettingsDatabase,
    )
  }

  private readonly fiscalSequenceReservationRepository: DrizzleFiscalSequenceReservationRepository

  public execute<TResponse>(
    operation: (transaction: CteIssuanceUnitOfWorkPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    return this.database.transaction((transaction) =>
      operation(new CteIssuanceTransaction(transaction)),
    )
  }

  public async findBatch(input: { readonly batchId: string; readonly companyId: string }) {
    const [record] = await this.database
      .select()
      .from(cteBatches)
      .where(and(eq(cteBatches.companyId, input.companyId), eq(cteBatches.id, input.batchId)))
      .limit(1)
    return record === undefined ? null : mapBatch(record)
  }

  public async submitDraftBatch(input: SubmitDraftBatchInput): Promise<void> {
    await submitDraftBatchRecord(this.database, input)
  }

  public async findBatchItem(input: BatchItemQuery) {
    return findBatchItemRecord(this.database, input)
  }

  public async listFiscalDocuments(input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
  }) {
    return listCteFiscalDocuments(this.database, input)
  }

  public async findIssuanceReplay(input: {
    readonly batchId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{ readonly requestFingerprint: string; readonly response: unknown } | null> {
    const [record] = await this.database
      .select({
        requestFingerprint: idempotencyRecords.requestFingerprint,
        response: idempotencyRecords.response,
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.companyId, input.companyId),
          eq(idempotencyRecords.operation, input.operation),
          eq(idempotencyRecords.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)

    return record === undefined
      ? null
      : {
          requestFingerprint: record.requestFingerprint,
          response: record.response,
        }
  }

  public async saveIssuanceReplay(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly requestFingerprint: string
    readonly response: unknown
    readonly operation?: string
  }): Promise<void> {
    await this.database.insert(idempotencyRecords).values({
      companyId: input.companyId,
      operation: getReplayOperation(input.operation),
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      response: input.response,
      status: 'succeeded',
    })
  }

  public findIssuance(input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly includeRejected?: boolean | undefined
    readonly includeRetry?: boolean | undefined
    readonly includeFailed?: boolean | undefined
    readonly includeReplay?: boolean | undefined
    readonly includeAuthorized?: boolean | undefined
  }): Promise<CteIssuanceIssuanceRecord | null> {
    return new CteIssuanceRepositoryQuery(this.database).findIssuance(input)
  }

  public createIssuance(input: CteIssuanceCreateAttemptInput): Promise<CteIssuanceCreatedAttempt> {
    return createIssuance(this.database, input)
  }

  public async requestCancellation(input: CteIssuanceCancellationRequest): Promise<void> {
    await requestCancellation(this.database, input)
  }

  public findFiscalSettings(input: {
    readonly companyId: string
  }): Promise<CteIssuanceFiscalSettings | null> {
    return findCteIssuanceFiscalSettings(this.database, input.companyId)
  }

  public async reserveFiscalNumber(input: CteIssuanceReservationRequest): Promise<{
    readonly id: string
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly companyId: string
  }> {
    const intention = createReservationInput(input)
    const reservation = await this.fiscalSequenceReservationRepository.reserve(intention)
    const reservationRecord = await findReservation(this.database, input)
    return {
      id: reservationRecord?.id ?? reservation.sequenceId,
      fiscalSeries: intention.series.toString(),
      fiscalNumber: reservation.number.toString(),
      companyId: input.companyId,
    }
  }

  public async scheduleRetry(input: {
    readonly attemptId: string
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly status: 'scheduled' | 'claimed' | 'exhausted' | 'cancelled'
    readonly attemptCount: number
    readonly maxAttempts: number
    readonly nextAttemptAt: string
  }): Promise<void> {
    await scheduleRetry(this.database, input)
  }

  public findPayloadSource(
    input: CteIssuancePayloadSourceQuery,
  ): Promise<CteIssuancePayloadSource | null> {
    return findCteIssuancePayloadSource(this.database, input)
  }

  public async savePayload(input: CteIssuancePayloadRecord): Promise<void> {
    await savePayload(this.database, input)
  }

  public async appendEvent(input: {
    readonly aggregateId: string
    readonly attemptId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly eventName: string
    readonly payload: Record<string, unknown>
  }): Promise<void> {
    await this.database.insert(cteIssuanceEvents).values({
      attemptId: input.attemptId,
      batchItemId: input.batchItemId,
      companyId: input.companyId,
      eventName: resolveIssuanceEventName(input.eventName),
      payload: input.payload,
      occurredAt: new Date(),
    })
  }

  public async pushOutbox(input: CteIssuanceOutboxCommand): Promise<void> {
    await pushOutbox(this.database, input)
  }
}

class CteIssuanceRepositoryQuery {
  private readonly database: Queryable

  public constructor(database: Queryable) {
    this.database = database
  }

  public async findIssuance(input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly includeRejected?: boolean | undefined
    readonly includeRetry?: boolean | undefined
    readonly includeFailed?: boolean | undefined
    readonly includeReplay?: boolean | undefined
    readonly includeAuthorized?: boolean | undefined
  }): Promise<CteIssuanceIssuanceRecord | null> {
    const statusCondition = statusFilter(input)
    const attempts = await this.database
      .select()
      .from(cteIssuanceAttempts)
      .where(
        and(
          eq(cteIssuanceAttempts.companyId, input.companyId),
          eq(cteIssuanceAttempts.batchId, input.batchId),
          eq(cteIssuanceAttempts.batchItemId, input.batchItemId),
          statusCondition,
        ),
      )
      .orderBy(desc(cteIssuanceAttempts.createdAt))
      .limit(1)

    const attempt = attempts[0]
    if (attempt === undefined) return null
    const retryCount = await countRetries(this.database, {
      attemptId: attempt.id,
      companyId: attempt.companyId,
    })
    const document = await findIssuedDocument(this.database, {
      batchItemId: attempt.batchItemId,
      companyId: attempt.companyId,
    })
    return {
      attemptId: attempt.id,
      batchId: attempt.batchId,
      companyId: attempt.companyId,
      reservationId: attempt.reservationId,
      context: {
        batchItemId: attempt.batchItemId,
        companyId: attempt.companyId,
        fiscalEnvironment: attempt.fiscalEnvironment,
        fiscalNumber: attempt.fiscalNumber.toString(),
        fiscalSeries: attempt.fiscalSeries,
        status: resolveIssuanceStatus(attempt.status, document),
        reasonCode: attempt.lastErrorCode ?? undefined,
        reasonCause: attempt.lastErrorCause ?? undefined,
        retryCount,
        attemptKind: getCteIssuanceAttemptKind(attempt.attemptKind),
        attemptNumber: Number(attempt.attemptNumber),
        correlationId: attempt.correlationId,
        idempotencyKey: attempt.idempotencyKey,
        fingerprint: attempt.requestFingerprint,
      },
      protocol: document?.authorizationProtocol,
      accessKey: document?.accessKey,
      issueRequestedAt: attempt.createdAt.toISOString(),
    }
  }
}

class CteIssuanceTransaction implements CteIssuanceUnitOfWorkPort {
  private readonly transaction: Transaction

  public constructor(transaction: Transaction) {
    this.transaction = transaction
  }

  public async findBatch(input: { readonly batchId: string; readonly companyId: string }) {
    const [record] = await this.transaction
      .select()
      .from(cteBatches)
      .where(and(eq(cteBatches.companyId, input.companyId), eq(cteBatches.id, input.batchId)))
      .limit(1)
    return record === undefined ? null : mapBatch(record)
  }

  public async submitDraftBatch(input: SubmitDraftBatchInput): Promise<void> {
    await submitDraftBatchRecord(this.transaction, input)
  }

  public async findBatchItem(input: BatchItemQuery) {
    return findBatchItemRecord(this.transaction, input)
  }

  public async listFiscalDocuments(input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
  }) {
    return listCteFiscalDocuments(this.transaction, input)
  }

  public async findIssuanceReplay(input: {
    readonly batchId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{ readonly requestFingerprint: string; readonly response: unknown } | null> {
    const [record] = await this.transaction
      .select({
        requestFingerprint: idempotencyRecords.requestFingerprint,
        response: idempotencyRecords.response,
      })
      .from(idempotencyRecords)
      .where(
        and(
          eq(idempotencyRecords.companyId, input.companyId),
          eq(idempotencyRecords.operation, input.operation),
          eq(idempotencyRecords.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)

    return record === undefined
      ? null
      : {
          requestFingerprint: record.requestFingerprint,
          response: record.response,
        }
  }

  public async saveIssuanceReplay(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly requestFingerprint: string
    readonly response: unknown
    readonly operation?: string
  }): Promise<void> {
    await this.transaction.insert(idempotencyRecords).values({
      companyId: input.companyId,
      operation: getReplayOperation(input.operation),
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      response: input.response,
      status: 'succeeded',
    })
  }

  public findIssuance(input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly includeRejected?: boolean | undefined
    readonly includeRetry?: boolean | undefined
    readonly includeFailed?: boolean | undefined
    readonly includeReplay?: boolean | undefined
    readonly includeAuthorized?: boolean | undefined
  }): Promise<CteIssuanceIssuanceRecord | null> {
    return new CteIssuanceRepositoryQuery(this.transaction).findIssuance(input)
  }

  public async createIssuance(
    input: CteIssuanceCreateAttemptInput,
  ): Promise<CteIssuanceCreatedAttempt> {
    return createIssuance(this.transaction, input)
  }

  public async requestCancellation(input: CteIssuanceCancellationRequest): Promise<void> {
    await requestCancellation(this.transaction, input)
  }

  public findFiscalSettings(input: {
    readonly companyId: string
  }): Promise<CteIssuanceFiscalSettings | null> {
    return findCteIssuanceFiscalSettings(this.transaction, input.companyId)
  }

  public async reserveFiscalNumber(input: CteIssuanceReservationRequest): Promise<{
    readonly id: string
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly companyId: string
  }> {
    const intention = createReservationInput(input)
    const reservation = await reserveFiscalNumber({
      intention,
      transaction: this.transaction as CompanySettingsTransaction,
    })
    const reservationRecord = await findReservation(this.transaction, input)
    return {
      id: reservationRecord?.id ?? reservation.sequenceId,
      fiscalSeries: intention.series.toString(),
      fiscalNumber: reservation.number.toString(),
      companyId: input.companyId,
    }
  }

  public async scheduleRetry(input: {
    readonly attemptId: string
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly status: 'scheduled' | 'claimed' | 'exhausted' | 'cancelled'
    readonly attemptCount: number
    readonly maxAttempts: number
    readonly nextAttemptAt: string
  }): Promise<void> {
    await scheduleRetry(this.transaction, input)
  }

  public findPayloadSource(
    input: CteIssuancePayloadSourceQuery,
  ): Promise<CteIssuancePayloadSource | null> {
    return findCteIssuancePayloadSource(this.transaction, input)
  }

  public async savePayload(input: CteIssuancePayloadRecord): Promise<void> {
    await savePayload(this.transaction, input)
  }

  public async appendEvent(input: {
    readonly aggregateId: string
    readonly attemptId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly eventName: string
    readonly payload: Record<string, unknown>
  }): Promise<void> {
    await this.transaction.insert(cteIssuanceEvents).values({
      attemptId: input.attemptId,
      batchItemId: input.batchItemId,
      companyId: input.companyId,
      eventName: resolveIssuanceEventName(input.eventName),
      payload: input.payload,
      occurredAt: new Date(),
    })
  }

  public async pushOutbox(input: CteIssuanceOutboxCommand): Promise<void> {
    await pushOutbox(this.transaction, input)
  }
}

async function pushOutbox(database: Queryable, input: CteIssuanceOutboxCommand): Promise<void> {
  await database.insert(cteIssuanceOutbox).values({
    aggregateId: input.aggregateId,
    aggregateSubtype: input.aggregateSubtype,
    aggregateType: input.aggregateType,
    actorUserId: input.actorUserId,
    attemptFingerprint: input.attemptFingerprint,
    attemptId: input.issueId,
    attemptKind: input.attemptKind,
    batchId: input.batchId,
    batchItemId: input.batchItemId,
    companyId: input.companyId,
    correlationId: input.correlationId,
    eventType: input.eventType,
    eventVersion: 1n,
    nextAttemptAt: new Date(),
    status: getOutboxStatus(input.status),
    payload: {
      batchItemId: input.batchItemId,
      batchId: input.batchId,
      attemptKind: input.attemptKind,
      status: getOutboxStatus(input.status),
      attemptFingerprint: input.attemptFingerprint,
      issueId: input.issueId,
    },
  })
}

/**
 * Marca a intenção de cancelar no próprio documento fiscal. O filtro por status e por
 * `cancellation_requested_at` nulo é o que impede duas requisições concorrentes de disparar
 * dois eventos 110111 para a mesma chave.
 */
async function requestCancellation(
  database: Queryable,
  input: CteIssuanceCancellationRequest,
): Promise<void> {
  const updated = await database
    .update(cteFiscalDocuments)
    .set({
      cancellationJustification: input.justification,
      cancellationRequestedAt: new Date(input.requestedAt),
      updatedAt: new Date(),
    })
    .where(and(...buildCancellationRequestFilters(input)))
    .returning({ id: cteFiscalDocuments.id })

  if (updated.length !== 1) {
    throw new ApiError({
      code: 'CTE_ISSUANCE_NOT_CANCELLABLE',
      message: 'CT-e issuance cannot be cancelled',
      status: 409,
    })
  }
}

async function resolveReservationId(
  database: Queryable,
  input: {
    readonly companyId: string
    readonly batchId: string
    readonly batchItemId: string
    readonly kind: 'issue' | 'reprocess'
  },
): Promise<string> {
  const reservationKey = `${input.batchId}:${input.batchItemId}:${input.kind}`
  const [row] = await database
    .select({ id: fiscalSequenceReservations.id })
    .from(fiscalSequenceReservations)
    .where(
      and(
        eq(fiscalSequenceReservations.companyId, input.companyId),
        eq(fiscalSequenceReservations.reservationKey, reservationKey),
      ),
    )
    .limit(1)
  return row?.id ?? crypto.randomUUID()
}

/** O cancelamento reaproveita a reserva já autorizada — não queima número fiscal novo. */
async function resolveAttemptReservationId(
  database: Queryable,
  input: CteIssuanceCreateAttemptInput,
): Promise<string> {
  if (input.reservationId !== undefined) return input.reservationId
  if (input.attemptKind === 'cancel') throw new Error('CTE_ISSUANCE_CANCEL_RESERVATION_REQUIRED')
  return resolveReservationId(database, { ...input, kind: input.attemptKind })
}

async function createIssuance(
  database: Queryable,
  input: CteIssuanceCreateAttemptInput,
): Promise<CteIssuanceCreatedAttempt> {
  const requestFingerprint = createAttemptFingerprint(input)
  const [record] = await database
    .insert(cteIssuanceAttempts)
    .values({
      batchId: input.batchId,
      batchItemId: input.batchItemId,
      companyId: input.companyId,
      attemptKind: input.attemptKind,
      attemptNumber: BigInt(input.attemptNumber),
      fiscalEnvironment: input.fiscalEnvironment,
      fiscalSeries: input.fiscalSeries,
      fiscalNumber: BigInt(input.fiscalNumber),
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      idempotencyFingerprint: requestFingerprint,
      correlationId: input.correlationId,
      reservationId: await resolveAttemptReservationId(database, input),
      status: getPersistedStatus(input.status),
      createdAt: new Date(input.issueRequestedAt),
      updatedAt: new Date(),
    })
    .returning()
  if (record === undefined) throw new Error('CTE_ISSUANCE_CREATE_FAILED')
  return mapCteIssuanceAttempt(record)
}

async function scheduleRetry(
  database: Queryable,
  input: {
    readonly attemptId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly status: 'scheduled' | 'claimed' | 'exhausted' | 'cancelled'
    readonly attemptCount: number
    readonly maxAttempts: number
    readonly nextAttemptAt: string
  },
): Promise<void> {
  await database.insert(cteRetrySchedules).values({
    attemptId: input.attemptId,
    companyId: input.companyId,
    status: input.status,
    attemptCount: BigInt(input.attemptCount),
    maxAttempts: BigInt(input.maxAttempts),
    nextAttemptAt: new Date(input.nextAttemptAt),
    lastErrorCause: 'retry requested',
    batchItemId: input.batchItemId,
  })
}

async function savePayload(database: Queryable, input: CteIssuancePayloadRecord): Promise<void> {
  await database
    .insert(cteIssuancePayloads)
    .values({
      attemptId: input.attemptId,
      batchId: input.batchId,
      batchItemId: input.batchItemId,
      companyId: input.companyId,
      payload: input.payload,
      payloadSha256: input.payloadSha256,
      providerConfig: input.providerConfig,
    })
    .onConflictDoNothing({
      target: [cteIssuancePayloads.companyId, cteIssuancePayloads.attemptId],
    })
}

async function findReservation(
  database: Queryable,
  input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly kind: 'issue' | 'reprocess'
  },
): Promise<{ readonly id: string } | null> {
  const reservationKey = `${input.batchId}:${input.batchItemId}:${input.kind}`
  const [record] = await database
    .select({ id: fiscalSequenceReservations.id })
    .from(fiscalSequenceReservations)
    .where(
      and(
        eq(fiscalSequenceReservations.companyId, input.companyId),
        eq(fiscalSequenceReservations.reservationKey, reservationKey),
      ),
    )
    .limit(1)
  return record ?? null
}

function createReservationInput(input: CteIssuanceReservationRequest): ReserveFiscalNumberInput {
  return {
    companyId: input.companyId,
    environment: input.environment,
    model: 'cte',
    reservationKey: `${input.batchId}:${input.batchItemId}:${input.kind}`,
    series: BigInt(input.series),
  }
}

function statusFilter(input: {
  readonly includeRejected?: boolean | undefined
  readonly includeRetry?: boolean | undefined
  readonly includeFailed?: boolean | undefined
  readonly includeReplay?: boolean | undefined
  readonly includeAuthorized?: boolean | undefined
}) {
  const hasCustomFilter =
    input.includeRejected ||
    input.includeRetry ||
    input.includeFailed ||
    input.includeReplay ||
    input.includeAuthorized
  if (!hasCustomFilter) return undefined

  const allowedStatuses: CteIssuancePersistedStatus[] = []
  if (input.includeAuthorized === true) allowedStatuses.push('authorized')
  if (input.includeRejected === true) allowedStatuses.push('rejected')
  if (input.includeRetry === true) allowedStatuses.push('retry_scheduled')
  if (input.includeFailed === true) allowedStatuses.push('failed')
  if (input.includeReplay === true) {
    allowedStatuses.push('in_flight', 'authorized', 'rejected', 'retry_scheduled', 'failed')
  }

  if (allowedStatuses.length === 0) return undefined
  const predicates = allowedStatuses.map((status) => eq(cteIssuanceAttempts.status, status))
  return predicates.length === 1 ? predicates[0] : or(...predicates)
}

function createAttemptFingerprint(input: {
  readonly attemptKind: CteIssuanceAttemptKind
  readonly attemptNumber: number
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
}): string {
  return `${input.companyId}:${input.batchId}:${input.batchItemId}:${input.attemptKind}:${input.attemptNumber}`
}

function getPersistedStatus(status: CteIssuanceAttemptStatus): CteIssuancePersistedStatus {
  if (status === 'requested') return 'in_flight'
  return status
}

function getDomainStatus(
  status: IssuanceAttemptRecord['status'],
): 'requested' | 'authorized' | 'rejected' | 'retry_scheduled' | 'failed' | 'cancelled' {
  if (status === 'in_flight' || status === 'pending') return 'requested'
  if (
    status === 'authorized' ||
    status === 'rejected' ||
    status === 'retry_scheduled' ||
    status === 'failed' ||
    status === 'cancelled'
  )
    return status
  throw new Error('CTE_ISSUANCE_UNSUPPORTED_STATUS')
}

export function resolveIssuanceEventName(
  value: string,
): 'issue_requested' | 'cancel_requested' | 'retry_scheduled' {
  if (value === 'cancel_requested') return 'cancel_requested'
  if (value === 'retry_scheduled') return 'retry_scheduled'
  return 'issue_requested'
}

function getReplayOperation(
  operation: string | undefined,
): 'cte-issuance.issue' | 'cte-issuance.reprocess' | 'cte-issuance.cancel' {
  if (operation === 'cte-issuance.reprocess') return 'cte-issuance.reprocess'
  if (operation === 'cte-issuance.cancel') return 'cte-issuance.cancel'
  return 'cte-issuance.issue'
}

function getOutboxStatus(status: CteIssuanceAttemptStatus): 'requested' | 'retry_scheduled' {
  if (status === 'retry_scheduled') return 'retry_scheduled'
  return 'requested'
}

export function buildBatchItemFilters(input: BatchItemQuery) {
  const filters = [
    eq(cteBatchItems.batchId, input.batchId),
    eq(cteBatchItems.companyId, input.companyId),
  ]
  if (input.batchItemId !== undefined) filters.push(eq(cteBatchItems.id, input.batchItemId))
  return filters
}

export function buildRetryScheduleFilters(input: {
  readonly attemptId: string
  readonly companyId: string
}) {
  return [
    eq(cteRetrySchedules.companyId, input.companyId),
    eq(cteRetrySchedules.attemptId, input.attemptId),
  ]
}

export function buildIssuedDocumentFilters(input: {
  readonly batchItemId: string
  readonly companyId: string
}) {
  return [
    eq(cteFiscalDocuments.companyId, input.companyId),
    eq(cteFiscalDocuments.batchItemId, input.batchItemId),
  ]
}

export function buildCancellationRequestFilters(input: {
  readonly batchItemId: string
  readonly companyId: string
}) {
  return [
    ...buildIssuedDocumentFilters(input),
    eq(cteFiscalDocuments.status, 'authorized'),
    isNull(cteFiscalDocuments.cancellationRequestedAt),
  ]
}

export function buildFiscalDocumentFilters(input: {
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
}) {
  return [
    eq(cteFiscalDocuments.companyId, input.companyId),
    eq(cteFiscalDocuments.batchItemId, input.batchItemId),
    eq(cteBatchItems.batchId, input.batchId),
  ]
}

/**
 * Fecha o rascunho junto com a emissão: sem isso existiria um instante em que o lote já foi
 * transmitido e ainda aceitaria remoção de item.
 */
async function submitDraftBatchRecord(
  queryable: Queryable,
  input: SubmitDraftBatchInput,
): Promise<void> {
  await queryable.insert(cteSubmissionRecords).values({
    batchId: input.batchId,
    companyId: input.companyId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.requestFingerprint,
    result: null,
    submissionStatus: 'pending',
  })

  const [record] = await queryable
    .update(cteBatches)
    .set({
      status: 'submitted',
      updatedAt: new Date(),
      version: sql`${cteBatches.version} + 1`,
    })
    .where(
      and(
        eq(cteBatches.companyId, input.companyId),
        eq(cteBatches.id, input.batchId),
        eq(cteBatches.status, 'draft'),
      ),
    )
    .returning({ id: cteBatches.id })
  if (record === undefined) throw createBatchInvalidState()

  await queryable.insert(cteBatchEvents).values({
    batchId: input.batchId,
    companyId: input.companyId,
    eventName: 'submitted',
    occurredAt: new Date(),
    payload: { previousStatus: 'draft', status: 'submitted', userId: input.userId },
  })
}

function createBatchInvalidState(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_INVALID_STATE',
    message: 'CT-e batch state transition is not allowed',
    status: 409,
  })
}

async function findBatchItemRecord(
  queryable: Queryable,
  input: BatchItemQuery,
): Promise<Record<string, unknown> | null> {
  const [record] = await queryable
    .select()
    .from(cteBatchItems)
    .where(and(...buildBatchItemFilters(input)))
    .limit(1)
  return record === undefined
    ? null
    : {
        batchId: record.batchId,
        companyId: record.companyId,
        id: record.id,
        status: 'unknown',
      }
}

async function listCteFiscalDocuments(
  queryable: Queryable,
  input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
  },
): Promise<readonly CteFiscalDocumentRecord[]> {
  const records = await queryable
    .select({
      accessKey: cteFiscalDocuments.accessKey,
      bucket: storedObjects.bucket,
      documentId: cteFiscalDocuments.id,
      mimeType: storedObjects.mimeType,
      objectKey: storedObjects.objectKey,
      sha256: cteFiscalDocuments.xmlSha256,
    })
    .from(cteFiscalDocuments)
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.id, cteFiscalDocuments.xmlObjectId),
        eq(storedObjects.companyId, cteFiscalDocuments.companyId),
      ),
    )
    .innerJoin(
      cteBatchItems,
      and(
        eq(cteBatchItems.id, cteFiscalDocuments.batchItemId),
        eq(cteBatchItems.companyId, cteFiscalDocuments.companyId),
      ),
    )
    .where(and(...buildFiscalDocumentFilters(input)))
    .orderBy(desc(cteFiscalDocuments.createdAt))

  return records.map((record) => ({
    accessKey: record.accessKey,
    bucket: record.bucket,
    contentType: record.mimeType,
    documentId: record.documentId,
    objectKey: record.objectKey,
    sha256: record.sha256,
  }))
}

function mapBatch(record: typeof cteBatches.$inferSelect): Record<string, unknown> {
  return {
    companyId: record.companyId,
    id: record.id,
    status: record.status,
  }
}

type IssuedDocumentRecord = {
  readonly accessKey: string
  readonly authorizationProtocol: string
  readonly cancellationRequestedAt: Date | null
  readonly status: 'authorized' | 'cancelled'
}

async function findIssuedDocument(
  database: Queryable,
  input: { readonly batchItemId: string; readonly companyId: string },
): Promise<IssuedDocumentRecord | null> {
  const [record] = await database
    .select({
      accessKey: cteFiscalDocuments.accessKey,
      authorizationProtocol: cteFiscalDocuments.authorizationProtocol,
      cancellationRequestedAt: cteFiscalDocuments.cancellationRequestedAt,
      status: cteFiscalDocuments.status,
    })
    .from(cteFiscalDocuments)
    .where(and(...buildIssuedDocumentFilters(input)))
    .limit(1)
  return record ?? null
}

function resolveIssuanceStatus(
  attemptStatus: IssuanceAttemptRecord['status'],
  document: IssuedDocumentRecord | null,
): 'requested' | 'authorized' | 'rejected' | 'retry_scheduled' | 'failed' | 'cancelled' {
  const status = getDomainStatus(attemptStatus)
  if (status !== 'authorized' || document === null) return status
  return resolveIssuedDocumentStatus(document)
}

async function countRetries(
  database: Queryable,
  input: { readonly attemptId: string; readonly companyId: string },
): Promise<number> {
  const rows = await database
    .select({ attemptCount: cteRetrySchedules.attemptCount })
    .from(cteRetrySchedules)
    .where(and(...buildRetryScheduleFilters(input)))
  return rows.length === 0 ? 0 : Number(rows[0]?.attemptCount ?? 0)
}
