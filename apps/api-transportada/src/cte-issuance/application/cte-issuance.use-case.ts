/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

const TEXT_ENCODER = new TextEncoder()
const ISSUE_OPERATION = 'cte-issuance.issue'
const REPROCESS_OPERATION = 'cte-issuance.reprocess'

type CteIssuanceStatus = 'requested' | 'authorized' | 'rejected' | 'retry_scheduled' | 'failed'
type CteIssuanceDbStatus =
  | 'requested'
  | 'in_flight'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'

type CteIssuanceAttemptKind = 'issue' | 'reprocess'

export type CteIssuanceContext = {
  readonly companyId: string
  readonly kind: 'company'
  readonly membershipId: string
  readonly permissions: ReadonlySet<string>
  readonly roles: readonly string[]
  readonly userId: string
}

export type CteIssuanceIssueInput = {
  readonly context: CteIssuanceContext
  readonly batchId: string
  readonly correlationId: string
  readonly idempotencyKey: string
}

export type CteIssuanceReprocessInput = {
  readonly batchId: string
  readonly batchItemId: string
  readonly context: CteIssuanceContext
  readonly correlationId: string
  readonly idempotencyKey: string
}

export type CteIssuanceLookupInput = {
  readonly batchId: string
  readonly batchItemId: string
  readonly context: CteIssuanceContext
  readonly includeRejected?: boolean
  readonly includeRetry?: boolean
  readonly includeFailed?: boolean
  readonly includeReplay?: boolean
  readonly includeAuthorized?: boolean
}

type CteIssuanceResult = {
  readonly attemptId: string
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
  readonly status: CteIssuanceStatus
  readonly context: {
    readonly batchItemId: string
    readonly companyId: string
    readonly fiscalEnvironment: 'homologation' | 'production'
    readonly fiscalNumber: string
    readonly fiscalSeries: string
    readonly status: CteIssuanceStatus
    readonly reasonCode?: string | undefined
    readonly reasonCause?: string | undefined
    readonly retryCount: number
    readonly attemptKind: CteIssuanceAttemptKind
    readonly attemptNumber: number
    readonly correlationId: string
    readonly idempotencyKey: string
    readonly fingerprint: string
  }
  readonly issueRequestedAt?: string | undefined
}

export type CteIssuanceIssuanceRecord = {
  readonly batchId: string
  readonly companyId: string
  readonly attemptId?: string
  readonly context: {
    readonly batchItemId: string
    readonly companyId: string
    readonly fiscalEnvironment: 'homologation' | 'production'
    readonly fiscalNumber: string
    readonly fiscalSeries: string
    readonly status: CteIssuanceStatus
    readonly reasonCode?: string | undefined
    readonly reasonCause?: string | undefined
    readonly retryCount: number
    readonly attemptKind: CteIssuanceAttemptKind
    readonly attemptNumber: number
    readonly correlationId: string
    readonly idempotencyKey: string
    readonly fingerprint: string
  }
  readonly protocol?: string | undefined
  readonly accessKey?: string | undefined
  readonly issueRequestedAt?: string | undefined
}

export type CteIssuanceFingerprintService = {
  readonly create: (input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }) => Promise<string>
}

export type CteIssuanceUnitOfWorkPort = {
  readonly execute?: <TResponse>(
    operation: (transaction: CteIssuanceUnitOfWorkPort) => Promise<TResponse>,
  ) => Promise<TResponse>
  readonly findBatch: (input: {
    readonly batchId: string
    readonly companyId: string
  }) => Promise<Record<string, unknown> | null>
  readonly findBatchItem: (input: {
    readonly batchId: string
    readonly companyId: string
  }) => Promise<Record<string, unknown> | null>
  readonly findIssuanceReplay: (input: {
    readonly batchId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }) => Promise<{ readonly requestFingerprint: string; readonly response: unknown } | null>
  readonly saveIssuanceReplay: (input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly requestFingerprint: string
    readonly response: unknown
    readonly operation?: string
  }) => Promise<void>
  readonly findIssuance: (input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly includeRejected?: boolean | undefined
    readonly includeRetry?: boolean | undefined
    readonly includeFailed?: boolean | undefined
    readonly includeReplay?: boolean | undefined
    readonly includeAuthorized?: boolean | undefined
  }) => Promise<CteIssuanceIssuanceRecord | null>
  readonly createIssuance: (input: {
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
    readonly status: CteIssuanceDbStatus
    readonly issueRequestedAt: string
  }) => Promise<Record<string, unknown>>
  readonly reserveFiscalNumber: (input: {
    readonly batchItemId: string
    readonly batchId: string
    readonly companyId: string
    readonly kind: CteIssuanceAttemptKind
  }) => Promise<{
    readonly id: string
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly companyId: string
  }>
  readonly scheduleRetry: (input: {
    readonly attemptId: string
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly status: 'scheduled' | 'claimed' | 'exhausted' | 'cancelled'
    readonly attemptCount: number
  }) => Promise<void>
  readonly appendEvent: (input: {
    readonly aggregateId: string
    readonly attemptId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly eventName: string
    readonly payload: Record<string, unknown>
  }) => Promise<void>
  readonly pushOutbox: (input: {
    readonly aggregateId: string
    readonly actorUserId: string
    readonly aggregateType: 'cte_batch'
    readonly aggregateSubtype: 'item'
    readonly batchItemId: string
    readonly batchId: string
    readonly companyId: string
    readonly correlationId: string
    readonly eventType: 'transportada.cte.item.issue.requested'
    readonly attemptKind: CteIssuanceAttemptKind
    readonly status: CteIssuanceStatus
    readonly issueId: string
    readonly attemptFingerprint: string
  }) => Promise<void>
}

export function createCteIssuanceUseCase(dependencies: {
  readonly fingerprintService: CteIssuanceFingerprintService
  readonly unitOfWork: CteIssuanceUnitOfWorkPort
}): {
  readonly issue: (input: CteIssuanceIssueInput) => Promise<CteIssuanceResult>
  readonly reprocess: (input: CteIssuanceReprocessInput) => Promise<CteIssuanceResult>
  readonly getIssuance: (
    input: CteIssuanceLookupInput,
  ) => Promise<
    CteIssuanceResult | { readonly code: string; readonly message: string; readonly status: number }
  >
} {
  return {
    issue: (input) => runIssue(dependencies, input),
    reprocess: (input) => runReprocess(dependencies, input),
    getIssuance: (input) => runGetIssuance(dependencies.unitOfWork, input),
  }
}

async function runIssue(
  dependencies: {
    readonly fingerprintService: CteIssuanceFingerprintService
    readonly unitOfWork: CteIssuanceUnitOfWorkPort
  },
  input: CteIssuanceIssueInput,
): Promise<CteIssuanceResult> {
  const operation = (transaction: CteIssuanceUnitOfWorkPort) =>
    executeIssue(dependencies.fingerprintService, transaction, input)
  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function runReprocess(
  dependencies: {
    readonly fingerprintService: CteIssuanceFingerprintService
    readonly unitOfWork: CteIssuanceUnitOfWorkPort
  },
  input: CteIssuanceReprocessInput,
): Promise<CteIssuanceResult> {
  const operation = (transaction: CteIssuanceUnitOfWorkPort) =>
    executeReprocess(dependencies.fingerprintService, transaction, input)
  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function runGetIssuance(
  unitOfWork: CteIssuanceUnitOfWorkPort,
  input: CteIssuanceLookupInput,
): Promise<
  CteIssuanceResult | { readonly code: string; readonly message: string; readonly status: number }
> {
  const batch = await unitOfWork.findBatch({
    batchId: input.batchId,
    companyId: input.context.companyId,
  })
  if (batch === null || batch['companyId'] !== input.context.companyId) throw createNotFound()

  const batchItem = await unitOfWork.findBatchItem({
    batchId: input.batchId,
    companyId: input.context.companyId,
  })
  if (batchItem === null || batchItem['companyId'] !== input.context.companyId)
    throw createNotFound()

  const issuance = await unitOfWork.findIssuance({
    batchId: input.batchId,
    batchItemId: getRequiredString(batchItem, 'id'),
    companyId: input.context.companyId,
    includeRejected: input.includeRejected,
    includeRetry: input.includeRetry,
    includeFailed: input.includeFailed,
    includeReplay: input.includeReplay,
    includeAuthorized: input.includeAuthorized,
  })
  if (issuance === null) throw createNotFound()

  return {
    attemptId: getLookupAttemptId(issuance, batchItem),
    attemptKind: getRequiredAttemptKind(issuance.context?.attemptKind),
    attemptNumber: getRequiredNumber(issuance.context?.attemptNumber),
    batchId: getRequiredString(issuance, 'batchId'),
    batchItemId: getRequiredString(issuance.context, 'batchItemId'),
    companyId: getRequiredString(issuance, 'companyId'),
    correlationId: getRequiredString(issuance.context, 'correlationId'),
    fiscalEnvironment: getRequiredFiscalEnvironment(issuance.context?.fiscalEnvironment),
    fiscalSeries: getRequiredString(issuance.context, 'fiscalSeries'),
    fiscalNumber: getRequiredString(issuance.context, 'fiscalNumber'),
    idempotencyKey: getRequiredString(issuance.context, 'idempotencyKey'),
    status: getRequiredStatus(issuance.context?.status),
    context: {
      batchItemId: getRequiredString(issuance.context, 'batchItemId'),
      companyId: getRequiredString(issuance.context, 'companyId'),
      fiscalEnvironment: getRequiredFiscalEnvironment(issuance.context?.fiscalEnvironment),
      fiscalNumber: getRequiredString(issuance.context, 'fiscalNumber'),
      fiscalSeries: getRequiredString(issuance.context, 'fiscalSeries'),
      status: getRequiredStatus(issuance.context?.status),
      reasonCode: getOptionalString(issuance.context?.reasonCode),
      reasonCause: getOptionalString(issuance.context?.reasonCause),
      retryCount: getRequiredNumber(issuance.context?.retryCount),
      attemptKind: getRequiredAttemptKind(issuance.context?.attemptKind),
      attemptNumber: getRequiredNumber(issuance.context?.attemptNumber),
      correlationId: getRequiredString(issuance.context, 'correlationId'),
      idempotencyKey: getRequiredString(issuance.context, 'idempotencyKey'),
      fingerprint: getRequiredString(issuance.context, 'fingerprint'),
    },
    issueRequestedAt: getOptionalString(issuance.issueRequestedAt),
  }
}

async function executeIssue(
  fingerprintService: CteIssuanceFingerprintService,
  transaction: CteIssuanceUnitOfWorkPort,
  input: CteIssuanceIssueInput,
): Promise<CteIssuanceResult> {
  const companyId = input.context.companyId
  const batch = await transaction.findBatch({ batchId: input.batchId, companyId })
  if (batch === null || batch['companyId'] !== companyId) throw createNotFound()
  const fingerprint = await fingerprintService.create({
    fields: [TEXT_ENCODER.encode(companyId), TEXT_ENCODER.encode(input.batchId)],
    operation: ISSUE_OPERATION,
  })
  const replay = await transaction.findIssuanceReplay({
    batchId: input.batchId,
    companyId,
    idempotencyKey: input.idempotencyKey,
    operation: ISSUE_OPERATION,
  })
  if (replay !== null) {
    if (replay.requestFingerprint !== fingerprint) throw createIdempotencyConflict()
    return replay.response as CteIssuanceResult
  }

  const batchItem = await transaction.findBatchItem({ batchId: input.batchId, companyId })
  if (batchItem === null || batchItem['companyId'] !== companyId) throw createNotFound()

  const batchItemId = getRequiredString(batchItem, 'id')

  const currentIssuance = await transaction.findIssuance({
    batchId: input.batchId,
    batchItemId,
    companyId,
  })
  const reservation = await transaction.reserveFiscalNumber({
    batchItemId,
    batchId: input.batchId,
    companyId,
    kind: 'issue',
  })
  const attemptNumber =
    currentIssuance === null ? 1 : getRequiredNumber(currentIssuance.context.attemptNumber) + 1
  const issueRequestedAt = new Date().toISOString()
  const created = await transaction.createIssuance({
    attemptKind: 'issue',
    attemptNumber,
    batchId: input.batchId,
    batchItemId,
    companyId,
    correlationId: input.correlationId,
    fiscalEnvironment: 'homologation',
    fiscalSeries: reservation.fiscalSeries,
    fiscalNumber: reservation.fiscalNumber,
    idempotencyKey: input.idempotencyKey,
    status: currentIssuance?.context.status === 'retry_scheduled' ? 'retry_scheduled' : 'requested',
    issueRequestedAt,
  })
  const issuance = normalizeCreateIssuanceResult({
    companyId,
    correlationId: input.correlationId,
    created,
    input,
    attemptNumber,
    batchItemId,
    issueRequestedAt,
    currentIssuance,
  })
  const attemptId = getRequiredString(issuance, 'attemptId')
  if (issuance.context.status === 'retry_scheduled') {
    await transaction.scheduleRetry({
      attemptId,
      batchId: input.batchId,
      batchItemId,
      companyId,
      status: 'scheduled',
      attemptCount: getRequiredNumber(issuance.context.attemptNumber),
    })
  }

  await transaction.appendEvent({
    aggregateId: input.batchId,
    attemptId,
    batchItemId,
    companyId,
    eventName:
      currentIssuance?.context.status === 'retry_scheduled' ? 'retry_scheduled' : 'issue_requested',
    payload: {
      status: getRequiredStatus(issuance.context.status),
      batchItemId,
      operation: ISSUE_OPERATION,
    },
  })
  await transaction.pushOutbox({
    aggregateId: input.batchId,
    actorUserId: input.context.userId,
    aggregateType: 'cte_batch',
    aggregateSubtype: 'item',
    batchItemId,
    batchId: input.batchId,
    companyId,
    correlationId: input.correlationId,
    eventType: 'transportada.cte.item.issue.requested',
    attemptKind: 'issue',
    status: getRequiredStatus(issuance.context.status),
    issueId: attemptId,
    attemptFingerprint: fingerprint,
  })
  await transaction.saveIssuanceReplay({
    companyId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: fingerprint,
    response: issuance,
    operation: ISSUE_OPERATION,
  })
  return issuance
}

async function executeReprocess(
  fingerprintService: CteIssuanceFingerprintService,
  transaction: CteIssuanceUnitOfWorkPort,
  input: CteIssuanceReprocessInput,
): Promise<CteIssuanceResult> {
  const companyId = input.context.companyId
  const batch = await transaction.findBatch({ batchId: input.batchId, companyId })
  if (batch === null || batch['companyId'] !== companyId) throw createNotFound()
  const batchItem = await transaction.findBatchItem({ batchId: input.batchId, companyId })
  if (batchItem === null || batchItem['companyId'] !== companyId) throw createNotFound()

  const batchItemId = getRequiredString(batchItem, 'id')
  const currentIssuance = await transaction.findIssuance({
    batchId: input.batchId,
    batchItemId,
    companyId,
  })
  if (currentIssuance === null || currentIssuance.context.status === 'authorized') {
    throw createNotReprocessable()
  }

  const fingerprint = await fingerprintService.create({
    fields: [
      TEXT_ENCODER.encode(companyId),
      TEXT_ENCODER.encode(input.batchId),
      TEXT_ENCODER.encode(batchItemId),
    ],
    operation: REPROCESS_OPERATION,
  })
  const replay = await transaction.findIssuanceReplay({
    batchId: input.batchId,
    companyId,
    idempotencyKey: input.idempotencyKey,
    operation: REPROCESS_OPERATION,
  })
  if (replay !== null) {
    if (replay.requestFingerprint !== fingerprint) throw createIdempotencyConflict()
    return replay.response as CteIssuanceResult
  }

  const reservation = await transaction.reserveFiscalNumber({
    batchItemId,
    batchId: input.batchId,
    companyId,
    kind: 'reprocess',
  })
  const attemptNumber = currentIssuance.context.attemptNumber + 1
  const issueRequestedAt = new Date().toISOString()
  const created = await transaction.createIssuance({
    attemptKind: 'reprocess',
    attemptNumber,
    batchId: input.batchId,
    batchItemId,
    companyId,
    correlationId: input.correlationId,
    fiscalEnvironment: getRequiredFiscalEnvironment(currentIssuance.context.fiscalEnvironment),
    fiscalSeries: reservation.fiscalSeries,
    fiscalNumber: reservation.fiscalNumber,
    idempotencyKey: input.idempotencyKey,
    status: 'requested',
    issueRequestedAt,
  })
  const issuance = normalizeCreateIssuanceResult({
    companyId,
    correlationId: input.correlationId,
    created,
    input: {
      context: input.context,
      batchId: input.batchId,
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
    },
    attemptNumber,
    batchItemId,
    issueRequestedAt,
    currentIssuance,
    attemptKind: 'reprocess',
  })
  const attemptId = getRequiredString(issuance, 'attemptId')

  await transaction.appendEvent({
    aggregateId: input.batchId,
    attemptId,
    batchItemId,
    companyId,
    eventName: 'issue_requested',
    payload: {
      batchItemId,
      operation: REPROCESS_OPERATION,
      status: 'requested',
    },
  })
  await transaction.pushOutbox({
    aggregateId: input.batchId,
    actorUserId: input.context.userId,
    aggregateType: 'cte_batch',
    aggregateSubtype: 'item',
    batchItemId,
    batchId: input.batchId,
    companyId,
    correlationId: input.correlationId,
    eventType: 'transportada.cte.item.issue.requested',
    attemptKind: 'reprocess',
    status: 'requested',
    issueId: attemptId,
    attemptFingerprint: fingerprint,
  })
  await transaction.saveIssuanceReplay({
    companyId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: fingerprint,
    response: issuance,
    operation: REPROCESS_OPERATION,
  })
  return issuance
}

function normalizeCreateIssuanceResult(input: {
  readonly companyId: string
  readonly correlationId: string
  readonly created: Record<string, unknown>
  readonly input: {
    readonly context: { readonly userId: string } & Record<string, unknown>
    readonly batchId: string
    readonly correlationId: string
    readonly idempotencyKey: string
  }
  readonly attemptNumber: number
  readonly batchItemId: string
  readonly issueRequestedAt: string
  readonly currentIssuance: CteIssuanceIssuanceRecord | null
  readonly attemptKind?: CteIssuanceAttemptKind
}): CteIssuanceResult {
  const attemptKind = input.attemptKind ?? 'issue'
  const status = getIssuedStatus(
    input.currentIssuance?.context.status === 'retry_scheduled' ? 'retry_scheduled' : 'requested',
  )
  const retryCount = input.currentIssuance?.context.retryCount ?? 0
  const reservationNumber = getRequiredString(
    input.created as Record<string, unknown>,
    'fiscalNumber',
  )
  const reservationSeries = getRequiredString(
    input.created as Record<string, unknown>,
    'fiscalSeries',
  )
  const fiscalEnvironment = getRequiredFiscalEnvironment(
    (input.created as Record<string, unknown>).fiscalEnvironment ?? 'homologation',
  )
  const attemptId =
    typeof input.created['attemptId'] === 'string' && input.created['attemptId'].length > 0
      ? (input.created['attemptId'] as string)
      : `attempt-${crypto.randomUUID()}`

  return {
    attemptId,
    attemptKind,
    attemptNumber: input.attemptNumber,
    batchId: input.input.batchId,
    batchItemId: input.batchItemId,
    companyId: input.companyId,
    correlationId: input.correlationId,
    fiscalEnvironment,
    fiscalSeries: reservationSeries,
    fiscalNumber: reservationNumber,
    idempotencyKey: input.input.idempotencyKey,
    status,
    issueRequestedAt: input.issueRequestedAt,
    context: {
      batchItemId: input.batchItemId,
      companyId: input.companyId,
      fiscalEnvironment,
      fiscalNumber: reservationNumber,
      fiscalSeries: reservationSeries,
      status: status === 'retry_scheduled' ? 'retry_scheduled' : 'requested',
      reasonCode:
        status === 'retry_scheduled'
          ? (getOptionalString(input.currentIssuance?.context.reasonCode) ?? 'TECHNICAL_TIMEOUT')
          : undefined,
      reasonCause:
        status === 'retry_scheduled'
          ? (getOptionalString(input.currentIssuance?.context.reasonCause) ?? 'provider timeout')
          : undefined,
      retryCount,
      attemptKind,
      attemptNumber: input.attemptNumber,
      correlationId: input.correlationId,
      idempotencyKey: input.input.idempotencyKey,
      fingerprint: getRequiredString(
        input.currentIssuance?.context ?? { fingerprint: `fingerprint-${input.batchItemId}` },
        'fingerprint',
      ),
    },
  }
}

function getRequiredStatus(value: unknown): CteIssuanceStatus {
  if (
    value === 'requested' ||
    value === 'authorized' ||
    value === 'rejected' ||
    value === 'retry_scheduled' ||
    value === 'failed'
  ) {
    return value
  }
  throw createInvalidState()
}

function getIssuedStatus(value: unknown): CteIssuanceStatus {
  if (value === 'retry_scheduled') return value
  return 'requested'
}

function getRequiredAttemptKind(value: unknown): CteIssuanceAttemptKind {
  if (value === 'issue' || value === 'reprocess') return value
  throw createInvalidState()
}

function getRequiredFiscalEnvironment(value: unknown): 'homologation' | 'production' {
  if (value === 'homologation' || value === 'production') return value
  throw createInvalidState()
}

function getRequiredString(source: Record<string, unknown>, field: string): string {
  const value = source[field]
  if (typeof value === 'string' && value.length > 0) return value
  throw createInvalidState()
}

function getRequiredNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'number' && value === 0) return value
  if (typeof value === 'bigint') return Number(value)
  throw createInvalidState()
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getLookupAttemptId(
  issuance: CteIssuanceIssuanceRecord,
  batchItem: Record<string, unknown>,
): string {
  if (typeof issuance.attemptId === 'string' && issuance.attemptId.length > 0)
    return issuance.attemptId
  if (typeof (issuance.context as Record<string, unknown>)['attemptId'] === 'string') {
    return (issuance.context as Record<string, unknown>)['attemptId'] as string
  }

  const batchItemId = getRequiredString(batchItem, 'id')
  const attemptNumber = getRequiredNumber(issuance.context.attemptNumber)
  return `attempt-${batchItemId}-${attemptNumber}`
}

function createNotFound(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_NOT_FOUND',
    message: 'CT-e issuance not found',
    status: 404,
  })
}

function createIdempotencyConflict(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

function createNotReprocessable(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_NOT_REPROCESSABLE',
    message: 'CT-e issuance cannot be reprocessed',
    status: 409,
  })
}

function createInvalidState(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_INVALID_STATE',
    message: 'CT-e issuance is in an invalid state',
    status: 409,
  })
}
