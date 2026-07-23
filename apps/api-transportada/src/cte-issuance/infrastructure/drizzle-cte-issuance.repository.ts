/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, or, sql } from 'drizzle-orm'

import {
  cteBatchItems,
  cteBatches,
  cteIssuanceAttempts,
  cteIssuanceEvents,
  cteIssuanceOutbox,
  cteRetrySchedules,
  fiscalSequenceReservations,
  idempotencyRecords,
} from '../../database/database.schema.js'
import type {
  CteIssuanceIssuanceRecord,
  CteIssuanceUnitOfWorkPort,
} from '../application/cte-issuance.use-case.js'
import type { CompanySettingsDatabase } from '../../companies/infrastructure/drizzle-company-settings.types.js'
import { DrizzleFiscalSequenceReservationRepository } from '../../companies/infrastructure/drizzle-fiscal-sequence-reservation.repository.js'
import type { ReserveFiscalNumberInput } from '../../companies/application/fiscal-sequence-reservation.port.js'
import type { CompanySettingsTransaction } from '../../companies/infrastructure/drizzle-company-settings.types.js'
import { reserveFiscalNumber } from '../../companies/infrastructure/drizzle-fiscal-sequence-reservation-persistence.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction

type IssuanceAttemptRecord = typeof cteIssuanceAttempts.$inferSelect
type CteIssuanceAttemptStatus =
  | 'requested'
  | 'in_flight'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'
type CteIssuancePersistedStatus =
  | 'in_flight'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'

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

  public async findBatchItem(input: { readonly batchId: string; readonly companyId: string }) {
    const [record] = await this.database
      .select()
      .from(cteBatchItems)
      .where(
        and(eq(cteBatchItems.batchId, input.batchId), eq(cteBatchItems.companyId, input.companyId)),
      )
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
      operation:
        input.operation === 'cte-issuance.reprocess'
          ? 'cte-issuance.reprocess'
          : 'cte-issuance.issue',
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

  public createIssuance(input: {
    readonly attemptKind: 'issue' | 'reprocess'
    readonly attemptNumber: number
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly correlationId: string
    readonly fiscalEnvironment: 'homologation' | 'production'
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly idempotencyKey: string
    readonly status: CteIssuanceAttemptStatus
    readonly issueRequestedAt: string
  }): Promise<Record<string, unknown>> {
    return createIssuance(this.database, input)
  }

  public async reserveFiscalNumber(input: {
    readonly batchItemId: string
    readonly batchId: string
    readonly companyId: string
    readonly kind: 'issue' | 'reprocess'
  }): Promise<{
    readonly id: string
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly companyId: string
  }> {
    const reservation = await this.fiscalSequenceReservationRepository.reserve(
      createReservationInput(input.companyId, input.batchId, input.batchItemId, input.kind),
    )
    const reservationRecord = await findReservation(this.database, input)
    return {
      id: reservationRecord?.id ?? reservation.sequenceId,
      fiscalSeries: '1',
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
  }): Promise<void> {
    await scheduleRetry(this.database, input)
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
      eventName: getEventName(input.eventName),
      payload: input.payload,
      occurredAt: new Date(),
    })
  }

  public async pushOutbox(_input: {
    readonly aggregateId: string
    readonly actorUserId: string
    readonly aggregateType: 'cte_batch'
    readonly aggregateSubtype: 'item'
    readonly batchItemId: string
    readonly batchId: string
    readonly companyId: string
    readonly correlationId: string
    readonly eventType: 'transportada.cte.item.issue.requested'
    readonly attemptKind: 'issue' | 'reprocess'
    readonly status: 'requested' | 'authorized' | 'rejected' | 'retry_scheduled' | 'failed'
    readonly issueId: string
    readonly attemptFingerprint: string
  }): Promise<void> {
    if (
      _input.aggregateType !== 'cte_batch' ||
      _input.eventType !== 'transportada.cte.item.issue.requested'
    ) {
      return
    }

    if (_input.attemptKind !== 'issue' && _input.attemptKind !== 'reprocess') {
      return
    }

    await this.database.insert(cteIssuanceOutbox).values({
      aggregateId: _input.aggregateId,
      aggregateSubtype: _input.aggregateSubtype,
      aggregateType: _input.aggregateType,
      actorUserId: _input.actorUserId,
      attemptFingerprint: _input.attemptFingerprint,
      attemptId: _input.issueId,
      attemptKind: _input.attemptKind,
      batchId: _input.batchId,
      batchItemId: _input.batchItemId,
      companyId: _input.companyId,
      correlationId: _input.correlationId,
      eventType: _input.eventType,
      eventVersion: 1n,
      nextAttemptAt: new Date(),
      status: getOutboxStatus(_input.status),
      payload: {
        batchItemId: _input.batchItemId,
        batchId: _input.batchId,
        attemptKind: _input.attemptKind,
        status: getOutboxStatus(_input.status),
        attemptFingerprint: _input.attemptFingerprint,
        issueId: _input.issueId,
      },
    })
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
    const retryCount = await countRetries(this.database, attempt.id)
    const schedule = await findRetrySchedule(this.database, attempt.companyId, attempt.id)
    return {
      attemptId: attempt.id,
      batchId: attempt.batchId,
      companyId: attempt.companyId,
      context: {
        batchItemId: attempt.batchItemId,
        companyId: attempt.companyId,
        fiscalEnvironment: attempt.fiscalEnvironment,
        fiscalNumber: attempt.fiscalNumber.toString(),
        fiscalSeries: attempt.fiscalSeries,
        status: getDomainStatus(attempt.status),
        reasonCode: attempt.lastErrorCode ?? undefined,
        reasonCause: attempt.lastErrorCause ?? undefined,
        retryCount,
        attemptKind: getAttemptKind(attempt.attemptKind),
        attemptNumber: Number(attempt.attemptNumber),
        correlationId: attempt.correlationId,
        idempotencyKey: attempt.idempotencyKey,
        fingerprint: attempt.requestFingerprint,
      },
      protocol: schedule?.protocol,
      accessKey: schedule?.accessKey,
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

  public async findBatchItem(input: { readonly batchId: string; readonly companyId: string }) {
    const [record] = await this.transaction
      .select()
      .from(cteBatchItems)
      .where(
        and(eq(cteBatchItems.batchId, input.batchId), eq(cteBatchItems.companyId, input.companyId)),
      )
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
      operation:
        input.operation === 'cte-issuance.reprocess'
          ? 'cte-issuance.reprocess'
          : 'cte-issuance.issue',
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

  public async createIssuance(input: {
    readonly attemptKind: 'issue' | 'reprocess'
    readonly attemptNumber: number
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly correlationId: string
    readonly fiscalEnvironment: 'homologation' | 'production'
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly idempotencyKey: string
    readonly status: CteIssuanceAttemptStatus
    readonly issueRequestedAt: string
  }): Promise<Record<string, unknown>> {
    return createIssuance(this.transaction, input)
  }

  public async reserveFiscalNumber(input: {
    readonly batchItemId: string
    readonly batchId: string
    readonly companyId: string
    readonly kind: 'issue' | 'reprocess'
  }): Promise<{
    readonly id: string
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly companyId: string
  }> {
    const intention = createReservationInput(
      input.companyId,
      input.batchId,
      input.batchItemId,
      input.kind,
    )
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
  }): Promise<void> {
    await scheduleRetry(this.transaction, input)
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
      eventName: getEventName(input.eventName),
      payload: input.payload,
      occurredAt: new Date(),
    })
  }

  public async pushOutbox(input: {
    readonly aggregateId: string
    readonly actorUserId: string
    readonly aggregateType: 'cte_batch'
    readonly aggregateSubtype: 'item'
    readonly batchItemId: string
    readonly batchId: string
    readonly companyId: string
    readonly correlationId: string
    readonly eventType: 'transportada.cte.item.issue.requested'
    readonly attemptKind: 'issue' | 'reprocess'
    readonly status: 'requested' | 'authorized' | 'rejected' | 'retry_scheduled' | 'failed'
    readonly issueId: string
    readonly attemptFingerprint: string
  }): Promise<void> {
    await this.transaction.insert(cteIssuanceOutbox).values({
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

async function createIssuance(
  database: Queryable,
  input: {
    readonly attemptKind: 'issue' | 'reprocess'
    readonly attemptNumber: number
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly correlationId: string
    readonly fiscalEnvironment: 'homologation' | 'production'
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly idempotencyKey: string
    readonly status: CteIssuanceAttemptStatus
    readonly issueRequestedAt: string
  },
): Promise<Record<string, unknown>> {
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
      reservationId: await resolveReservationId(database, { ...input, kind: input.attemptKind }),
      status: getPersistedStatus(input.status),
      createdAt: new Date(input.issueRequestedAt),
      updatedAt: new Date(),
    })
    .returning()
  if (record === undefined) throw new Error('CTE_ISSUANCE_CREATE_FAILED')
  return mapIssuanceAttempt(record)
}

async function scheduleRetry(
  database: Queryable,
  input: {
    readonly attemptId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly status: 'scheduled' | 'claimed' | 'exhausted' | 'cancelled'
    readonly attemptCount: number
  },
): Promise<void> {
  await database.insert(cteRetrySchedules).values({
    attemptId: input.attemptId,
    companyId: input.companyId,
    status: input.status,
    attemptCount: BigInt(input.attemptCount),
    maxAttempts: 3n,
    nextAttemptAt: new Date(Date.now() + 10_000),
    lastErrorCause: 'retry requested',
    batchItemId: input.batchItemId,
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

function createReservationInput(
  companyId: string,
  batchId: string,
  batchItemId: string,
  kind: 'issue' | 'reprocess',
): ReserveFiscalNumberInput {
  return {
    companyId,
    environment: 'homologation',
    model: 'cte',
    reservationKey: `${batchId}:${batchItemId}:${kind}`,
    series: 1n,
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
  readonly attemptKind: 'issue' | 'reprocess'
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
): 'requested' | 'authorized' | 'rejected' | 'retry_scheduled' | 'failed' {
  if (status === 'in_flight' || status === 'pending') return 'requested'
  if (
    status === 'authorized' ||
    status === 'rejected' ||
    status === 'retry_scheduled' ||
    status === 'failed'
  )
    return status
  throw new Error('CTE_ISSUANCE_UNSUPPORTED_STATUS')
}

function getAttemptKind(kind: IssuanceAttemptRecord['attemptKind']): 'issue' | 'reprocess' {
  if (kind === 'issue' || kind === 'reprocess') return kind
  throw new Error('CTE_ISSUANCE_UNSUPPORTED_ATTEMPT_KIND')
}

function getEventName(value: string): 'issue_requested' | 'retry_scheduled' {
  if (value === 'retry_scheduled') return 'retry_scheduled'
  return 'issue_requested'
}

function getOutboxStatus(
  status: 'requested' | 'authorized' | 'rejected' | 'retry_scheduled' | 'failed',
): 'requested' | 'retry_scheduled' {
  if (status === 'retry_scheduled') return 'retry_scheduled'
  return 'requested'
}

function mapBatch(record: typeof cteBatches.$inferSelect): Record<string, unknown> {
  return {
    companyId: record.companyId,
    id: record.id,
    status: record.status,
  }
}

function mapIssuanceAttempt(record: IssuanceAttemptRecord): Record<string, unknown> {
  return {
    batchId: record.batchId,
    companyId: record.companyId,
    attemptId: record.id,
    attemptNumber: record.attemptNumber.toString(),
    attemptKind: getAttemptKind(record.attemptKind),
    attemptFingerprint: record.requestFingerprint,
    context: {
      attemptId: record.id,
      batchItemId: record.batchItemId,
      batchId: record.batchId,
      companyId: record.companyId,
    },
  }
}

async function findRetrySchedule(
  database: Queryable,
  companyId: string,
  attemptId: string,
): Promise<{ readonly protocol?: string; readonly accessKey?: string } | null> {
  const [record] = await database
    .select({
      protocol: sql<string>`NULL`,
      accessKey: sql<string>`NULL`,
    })
    .from(cteRetrySchedules)
    .where(
      and(eq(cteRetrySchedules.companyId, companyId), eq(cteRetrySchedules.attemptId, attemptId)),
    )
    .limit(1)
  return record === undefined ? null : record
}

async function countRetries(database: Queryable, attemptId: string): Promise<number> {
  const rows = await database
    .select({ attemptCount: cteRetrySchedules.attemptCount })
    .from(cteRetrySchedules)
    .where(eq(cteRetrySchedules.attemptId, attemptId))
  return rows.length === 0 ? 0 : Number(rows[0]?.attemptCount ?? 0)
}
