/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq, sql } from 'drizzle-orm'

import {
  fiscalSequenceReservations,
  fiscalSequences,
} from '../../database/fiscal-sequence.schema.js'
import {
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  mdfeIssuanceEvents,
  mdfeIssuanceOutbox,
  mdfeIssuancePayloads,
  mdfeManifests,
  type MdfeIssuanceStatus,
} from '../../database/mdfe.schema.js'
import { reserveFiscalNumber } from '../../companies/infrastructure/drizzle-fiscal-sequence-reservation-persistence.service.js'
import type {
  AppendMdfeIssuanceEventInput,
  CreateMdfeIssuanceAttemptInput,
  MdfeIssuanceAttemptRecord,
  MdfeIssuancePayloadRecord,
  MdfeIssuanceRepositoryPort,
  MdfeIssuanceState,
  MdfeIssuanceTransactionPort,
  MdfeNumberReservation,
  PushMdfeIssuanceOutboxInput,
  RecordMdfeCancellationRequestInput,
  RecordMdfeClosureRequestInput,
  ReserveMdfeNumberInput,
} from '../application/mdfe-issuance.port.js'
import { findMdfeIssuancePayloadSource } from './mdfe-issuance-payload.query.js'
import {
  buildAttemptIdempotencyFilters,
  buildFiscalDocumentFilters,
  buildIssuanceStateFilters,
  buildOpenAttemptFilters,
  buildReservationFilters,
} from './mdfe-issuance.query.js'
import type { MdfeDatabase, MdfeTransaction } from './mdfe-queryable.type.js'

const AGGREGATE_TYPE = 'mdfe_manifest'
const AGGREGATE_SUBTYPE = 'manifest'
const FISCAL_MODEL = 'mdfe'

/** Séries adicionais de MDF-e são parametrizadas depois; a primeira emissão nasce na série 1. */
const DEFAULT_SERIES = 1n

export class DrizzleMdfeIssuanceRepository implements MdfeIssuanceRepositoryPort {
  public constructor(private readonly database: MdfeDatabase) {}

  public async transaction<TResult>(
    scope: { readonly companyId: string },
    handler: (transaction: MdfeIssuanceTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) =>
      handler(createScopedTransaction(transaction, scope.companyId)),
    )
  }
}

function createScopedTransaction(
  transaction: MdfeTransaction,
  companyId: string,
): MdfeIssuanceTransactionPort {
  return {
    async appendEvent(input) {
      await appendEvent(transaction, companyId, input)
    },
    async createAttempt(input) {
      return createAttempt(transaction, companyId, input)
    },
    async findAttemptByIdempotencyKey(input) {
      return findAttemptByIdempotencyKey(transaction, companyId, input.idempotencyKey)
    },
    async findIssuanceState(input) {
      return findIssuanceState(transaction, companyId, input.manifestId)
    },
    async findPayloadSource(input) {
      return findMdfeIssuancePayloadSource(transaction, {
        companyId,
        manifestId: input.manifestId,
      })
    },
    async findPendingAttempt(input) {
      return findPendingAttempt(transaction, companyId, input)
    },
    async markManifestIssuing(input) {
      await markManifestIssuing(transaction, companyId, input)
    },
    async pushOutbox(input) {
      await pushOutbox(transaction, companyId, input)
    },
    async recordCancellationRequest(input) {
      await recordCancellationRequest(transaction, companyId, input)
    },
    async recordClosureRequest(input) {
      await recordClosureRequest(transaction, companyId, input)
    },
    async reserveNumber(input) {
      return reserveNumber(transaction, companyId, input)
    },
    async savePayload(input) {
      await savePayload(transaction, companyId, input)
    },
  }
}

async function savePayload(
  transaction: MdfeTransaction,
  companyId: string,
  input: MdfeIssuancePayloadRecord,
): Promise<void> {
  await transaction.insert(mdfeIssuancePayloads).values({
    attemptId: input.attemptId,
    companyId,
    manifestId: input.manifestId,
    payload: input.payload,
    payloadSha256: input.payloadSha256,
    providerConfig: input.providerConfig,
  })
}

async function findIssuanceState(
  transaction: MdfeTransaction,
  companyId: string,
  manifestId: string,
): Promise<MdfeIssuanceState | null> {
  const [record] = await transaction
    .select({
      accessKey: mdfeFiscalDocuments.accessKey,
      authorizationProtocol: mdfeFiscalDocuments.authorizationProtocol,
      authorizedAt: mdfeFiscalDocuments.authorizedAt,
      fiscalEnvironment: mdfeManifests.fiscalEnvironment,
      manifestId: mdfeManifests.id,
      status: mdfeManifests.status,
      version: mdfeManifests.version,
    })
    .from(mdfeManifests)
    .leftJoin(
      mdfeFiscalDocuments,
      and(
        eq(mdfeFiscalDocuments.companyId, mdfeManifests.companyId),
        eq(mdfeFiscalDocuments.manifestId, mdfeManifests.id),
      ),
    )
    .where(and(...buildIssuanceStateFilters({ companyId, manifestId })))
    .limit(1)
  if (record === undefined) return null

  return {
    accessKey: record.accessKey ?? null,
    authorizationProtocol: record.authorizationProtocol ?? null,
    authorizedAt: record.authorizedAt?.toISOString() ?? null,
    fiscalEnvironment: record.fiscalEnvironment,
    manifestId: record.manifestId,
    status: record.status,
    version: record.version.toString(),
  }
}

type AttemptRow = {
  readonly attemptKind: MdfeIssuanceAttemptRecord['attemptKind']
  readonly attemptNumber: bigint
  readonly createdAt: Date
  readonly id: string
  readonly manifestId: string
  readonly requestFingerprint: string
  readonly status: MdfeIssuanceStatus
}

const ATTEMPT_COLUMNS = {
  attemptKind: mdfeIssuanceAttempts.attemptKind,
  attemptNumber: mdfeIssuanceAttempts.attemptNumber,
  createdAt: mdfeIssuanceAttempts.createdAt,
  id: mdfeIssuanceAttempts.id,
  manifestId: mdfeIssuanceAttempts.manifestId,
  requestFingerprint: mdfeIssuanceAttempts.requestFingerprint,
  status: mdfeIssuanceAttempts.status,
} as const

function mapAttempt(row: AttemptRow): MdfeIssuanceAttemptRecord {
  return {
    attemptId: row.id,
    attemptKind: row.attemptKind,
    attemptNumber: Number(row.attemptNumber),
    createdAt: row.createdAt.toISOString(),
    manifestId: row.manifestId,
    requestFingerprint: row.requestFingerprint,
    status: row.status,
  }
}

async function findAttemptByIdempotencyKey(
  transaction: MdfeTransaction,
  companyId: string,
  idempotencyKey: string,
): Promise<MdfeIssuanceAttemptRecord | null> {
  const [record] = await transaction
    .select(ATTEMPT_COLUMNS)
    .from(mdfeIssuanceAttempts)
    .where(and(...buildAttemptIdempotencyFilters({ companyId, idempotencyKey })))
    .limit(1)
  return record === undefined ? null : mapAttempt(record)
}

async function findPendingAttempt(
  transaction: MdfeTransaction,
  companyId: string,
  input: {
    readonly attemptKind: MdfeIssuanceAttemptRecord['attemptKind']
    readonly manifestId: string
  },
): Promise<MdfeIssuanceAttemptRecord | null> {
  const [record] = await transaction
    .select(ATTEMPT_COLUMNS)
    .from(mdfeIssuanceAttempts)
    .where(
      and(
        ...buildOpenAttemptFilters({
          attemptKind: input.attemptKind,
          companyId,
          manifestId: input.manifestId,
        }),
      ),
    )
    .orderBy(desc(mdfeIssuanceAttempts.createdAt))
    .limit(1)
  return record === undefined ? null : mapAttempt(record)
}

async function createAttempt(
  transaction: MdfeTransaction,
  companyId: string,
  input: CreateMdfeIssuanceAttemptInput,
): Promise<MdfeIssuanceAttemptRecord> {
  const [record] = await transaction
    .insert(mdfeIssuanceAttempts)
    .values({
      attemptKind: input.attemptKind,
      attemptNumber: sql`coalesce((select max(${mdfeIssuanceAttempts.attemptNumber}) from ${mdfeIssuanceAttempts} where ${mdfeIssuanceAttempts.companyId} = ${companyId} and ${mdfeIssuanceAttempts.manifestId} = ${input.manifestId}), 0) + 1`,
      companyId,
      correlationId: input.correlationId,
      fiscalEnvironment: input.fiscalEnvironment,
      fiscalNumber: input.fiscalNumber === undefined ? null : BigInt(input.fiscalNumber),
      fiscalSeries: input.fiscalSeries ?? '',
      idempotencyFingerprint: input.requestFingerprint,
      idempotencyKey: input.idempotencyKey,
      manifestId: input.manifestId,
      requestFingerprint: input.requestFingerprint,
      reservationId: input.reservationId ?? null,
      status: 'pending',
    })
    .returning(ATTEMPT_COLUMNS)
  if (record === undefined) {
    throw new Error('MDF-e issuance attempt insert returned no row')
  }
  return mapAttempt(record)
}

async function markManifestIssuing(
  transaction: MdfeTransaction,
  companyId: string,
  input: {
    readonly fiscalNumber: string
    readonly fiscalSeries: string
    readonly manifestId: string
  },
): Promise<void> {
  await transaction
    .update(mdfeManifests)
    .set({
      fiscalNumber: BigInt(input.fiscalNumber),
      fiscalSeries: input.fiscalSeries,
      status: 'issuing',
      updatedAt: sql`now()`,
      version: sql`${mdfeManifests.version} + 1`,
    })
    .where(and(...buildIssuanceStateFilters({ companyId, manifestId: input.manifestId })))
}

async function recordClosureRequest(
  transaction: MdfeTransaction,
  companyId: string,
  input: RecordMdfeClosureRequestInput,
): Promise<void> {
  await transaction
    .update(mdfeFiscalDocuments)
    .set({
      closureCityCode: input.closureCityCode,
      closureState: input.closureState,
      updatedAt: sql`now()`,
    })
    .where(and(...buildFiscalDocumentFilters({ companyId, manifestId: input.manifestId })))
}

async function recordCancellationRequest(
  transaction: MdfeTransaction,
  companyId: string,
  input: RecordMdfeCancellationRequestInput,
): Promise<void> {
  await transaction
    .update(mdfeFiscalDocuments)
    .set({
      cancellationJustification: input.justification,
      cancellationRequestedAt: new Date(input.requestedAt),
      updatedAt: sql`now()`,
    })
    .where(and(...buildFiscalDocumentFilters({ companyId, manifestId: input.manifestId })))
}

async function appendEvent(
  transaction: MdfeTransaction,
  companyId: string,
  input: AppendMdfeIssuanceEventInput,
): Promise<void> {
  await transaction.insert(mdfeIssuanceEvents).values({
    attemptId: input.attemptId,
    companyId,
    eventName: input.eventName,
    manifestId: input.manifestId,
    occurredAt: new Date(input.occurredAt),
    payload: input.payload,
  })
}

async function pushOutbox(
  transaction: MdfeTransaction,
  companyId: string,
  input: PushMdfeIssuanceOutboxInput,
): Promise<void> {
  await transaction.insert(mdfeIssuanceOutbox).values({
    actorUserId: input.actorUserId,
    aggregateId: input.manifestId,
    aggregateSubtype: AGGREGATE_SUBTYPE,
    aggregateType: AGGREGATE_TYPE,
    attemptFingerprint: input.attemptFingerprint,
    attemptId: input.attemptId,
    attemptKind: input.attemptKind,
    companyId,
    correlationId: input.correlationId,
    eventType: input.eventType,
    eventVersion: 1n,
    manifestId: input.manifestId,
    payload: input.payload,
    status: 'requested',
  })
}

async function reserveNumber(
  transaction: MdfeTransaction,
  companyId: string,
  input: ReserveMdfeNumberInput,
): Promise<MdfeNumberReservation> {
  await ensureSequence(transaction, companyId, input)
  const reservation = await reserveFiscalNumber({
    intention: {
      companyId,
      environment: input.environment,
      model: FISCAL_MODEL,
      reservationKey: input.reservationKey,
      series: DEFAULT_SERIES,
    },
    transaction,
  })
  const [record] = await transaction
    .select({ id: fiscalSequenceReservations.id })
    .from(fiscalSequenceReservations)
    .where(and(...buildReservationFilters({ companyId, reservationKey: input.reservationKey })))
    .limit(1)
  if (record === undefined) {
    throw new Error('MDF-e fiscal number reservation is missing its ledger row')
  }

  return {
    number: reservation.number.toString(),
    reservationId: record.id,
    series: DEFAULT_SERIES.toString(),
  }
}

/** A empresa não parametriza numeração de MDF-e: a primeira emissão abre a sequência sozinha. */
async function ensureSequence(
  transaction: MdfeTransaction,
  companyId: string,
  input: ReserveMdfeNumberInput,
): Promise<void> {
  await transaction
    .insert(fiscalSequences)
    .values({
      companyId,
      environment: input.environment,
      model: FISCAL_MODEL,
      nextNumber: 1n,
      series: DEFAULT_SERIES,
    })
    .onConflictDoNothing({
      target: [
        fiscalSequences.companyId,
        fiscalSequences.environment,
        fiscalSequences.model,
        fiscalSequences.series,
      ],
    })
}
