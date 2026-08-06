/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import {
  calculateCteRetryNextAttemptAt,
  isCteRetryExhausted,
  type CteRetryPolicy,
} from '../domain/cte-retry.policy.js'

import { CteIssuancePayloadSourceMissingError } from './cte-issuance-payload.error.js'
import type {
  CteIssuanceFiscalEnvironment,
  CteIssuancePayloadRecord,
  CteIssuancePayloadSource,
  CteIssuancePayloadSourceQuery,
} from './cte-issuance-payload.port.js'
import { assembleCteIssuancePayload } from './cte-issuance-payload.service.js'

const TEXT_ENCODER = new TextEncoder()
const ISSUE_OPERATION = 'cte-issuance.issue'
const REPROCESS_OPERATION = 'cte-issuance.reprocess'
const CANCEL_OPERATION = 'cte-issuance.cancel'
/** Mínimo exigido pela SEFAZ na xJust do evento 110111. */
const CANCELLATION_JUSTIFICATION_MIN_LENGTH = 15
/** Transmitir é o único comando do operador: o rascunho é fechado aqui, dentro da mesma transação. */
/** `in_flight` entra porque o lote parcialmente emitido precisa reemitir só o item que ficou. */
const ISSUABLE_BATCH_STATUSES: readonly string[] = ['draft', 'submitted', 'error', 'in_flight']
const DRAFT_BATCH_STATUS = 'draft'

type CteIssuanceStatus =
  | 'requested'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'
  | 'cancelled'
type CteIssuanceDbStatus =
  | 'requested'
  | 'in_flight'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'
  | 'cancelled'

type CteIssuanceAttemptKind = 'issue' | 'reprocess' | 'cancel'

export type CteIssuanceFiscalSettings = {
  readonly environment: CteIssuanceFiscalEnvironment
  readonly retryPolicy: CteRetryPolicy
  readonly series: string
}

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

export type CteIssuanceCancelInput = {
  readonly batchId: string
  readonly batchItemId: string
  readonly context: CteIssuanceContext
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly justification: string
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

export type CteIssuanceDocumentInput = {
  readonly batchId: string
  readonly batchItemId: string
  readonly context: CteIssuanceContext
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

export type CteIssuanceCreatedAttempt = {
  readonly attemptFingerprint: string
  readonly attemptId: string
  readonly attemptKind: CteIssuanceAttemptKind
  readonly attemptNumber: string
  readonly batchId: string
  readonly companyId: string
  readonly fiscalEnvironment: CteIssuanceFiscalEnvironment
  readonly fiscalNumber: string
  readonly fiscalSeries: string
  readonly context: {
    readonly attemptId: string
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly fiscalEnvironment: CteIssuanceFiscalEnvironment
    readonly fiscalNumber: string
    readonly fiscalSeries: string
  }
}

export type CteIssuanceIssuanceRecord = {
  readonly batchId: string
  readonly companyId: string
  readonly attemptId?: string
  readonly reservationId?: string
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

export type CteFiscalDocumentRecord = {
  readonly accessKey: string
  readonly bucket: string
  readonly contentType: string
  readonly documentId: string
  readonly objectKey: string
  readonly sha256: string
}

export type CteDocumentDownloadPort = {
  readonly createDownloadUrl: (input: {
    readonly bucket: string
    readonly fileName: string
    readonly key: string
  }) => Promise<{ readonly expiresAt: string; readonly url: string }>
}

export type CteIssuanceDocument = {
  readonly accessKey: string
  readonly contentType: string
  readonly documentId: string
  readonly downloadUrl: string
  readonly expiresAt: string
  readonly sha256: string
}

export type CteIssuanceDocumentPage = {
  readonly items: readonly CteIssuanceDocument[]
  readonly nextCursor: string | null
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
    readonly batchItemId?: string | undefined
    readonly companyId: string
  }) => Promise<Record<string, unknown> | null>
  /** O lote inteiro, na ordem de `position`: transmitir é um comando sobre todos os itens. */
  readonly listIssuableBatchItems: (input: {
    readonly batchId: string
    readonly companyId: string
  }) => Promise<readonly Record<string, unknown>[]>
  readonly submitDraftBatch: (input: {
    readonly batchId: string
    readonly companyId: string
    readonly idempotencyKey: string
    readonly requestFingerprint: string
    readonly userId: string
  }) => Promise<void>
  readonly listFiscalDocuments: (input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
  }) => Promise<readonly CteFiscalDocumentRecord[]>
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
    readonly reservationId?: string
    readonly status: CteIssuanceDbStatus
    readonly issueRequestedAt: string
  }) => Promise<CteIssuanceCreatedAttempt>
  readonly findFiscalSettings: (input: {
    readonly companyId: string
  }) => Promise<CteIssuanceFiscalSettings | null>
  readonly reserveFiscalNumber: (input: {
    readonly batchItemId: string
    readonly batchId: string
    readonly companyId: string
    readonly environment: CteIssuanceFiscalEnvironment
    readonly kind: 'issue' | 'reprocess'
    readonly series: string
  }) => Promise<{
    readonly id: string
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly companyId: string
  }>
  readonly findPayloadSource: (
    input: CteIssuancePayloadSourceQuery,
  ) => Promise<CteIssuancePayloadSource | null>
  readonly savePayload: (input: CteIssuancePayloadRecord) => Promise<void>
  readonly requestCancellation: (input: {
    readonly attemptId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly justification: string
    readonly requestedAt: string
  }) => Promise<void>
  readonly scheduleRetry: (input: {
    readonly attemptId: string
    readonly batchId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly status: 'scheduled' | 'claimed' | 'exhausted' | 'cancelled'
    readonly attemptCount: number
    readonly maxAttempts: number
    readonly nextAttemptAt: string
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
    readonly eventType:
      | 'transportada.cte.item.issue.requested'
      | 'transportada.cte.item.cancel.requested'
    readonly attemptKind: CteIssuanceAttemptKind
    readonly status: CteIssuanceStatus
    readonly issueId: string
    readonly attemptFingerprint: string
  }) => Promise<void>
}

export function createCteIssuanceUseCase(dependencies: {
  readonly documentDownload: CteDocumentDownloadPort
  readonly fingerprintService: CteIssuanceFingerprintService
  readonly unitOfWork: CteIssuanceUnitOfWorkPort
}): {
  readonly issue: (input: CteIssuanceIssueInput) => Promise<CteIssuanceResult>
  readonly reprocess: (input: CteIssuanceReprocessInput) => Promise<CteIssuanceResult>
  readonly cancel: (input: CteIssuanceCancelInput) => Promise<CteIssuanceResult>
  readonly getIssuance: (
    input: CteIssuanceLookupInput,
  ) => Promise<
    CteIssuanceResult | { readonly code: string; readonly message: string; readonly status: number }
  >
  readonly listDocuments: (input: CteIssuanceDocumentInput) => Promise<CteIssuanceDocumentPage>
} {
  return {
    issue: (input) => runIssue(dependencies, input),
    reprocess: (input) => runReprocess(dependencies, input),
    cancel: (input) => runCancel(dependencies, input),
    getIssuance: (input) => runGetIssuance(dependencies.unitOfWork, input),
    listDocuments: (input) => runListDocuments(dependencies, input),
  }
}

async function runListDocuments(
  dependencies: {
    readonly documentDownload: CteDocumentDownloadPort
    readonly unitOfWork: CteIssuanceUnitOfWorkPort
  },
  input: CteIssuanceDocumentInput,
): Promise<CteIssuanceDocumentPage> {
  const companyId = input.context.companyId
  const batch = await dependencies.unitOfWork.findBatch({ batchId: input.batchId, companyId })
  if (batch === null || batch['companyId'] !== companyId) throw createNotFound()

  const batchItem = await dependencies.unitOfWork.findBatchItem({
    batchId: input.batchId,
    batchItemId: input.batchItemId,
    companyId,
  })
  if (batchItem === null || batchItem['companyId'] !== companyId) throw createNotFound()

  const documents = await dependencies.unitOfWork.listFiscalDocuments({
    batchId: input.batchId,
    batchItemId: getRequiredString(batchItem, 'id'),
    companyId,
  })

  const items = await Promise.all(
    documents.map(async (document) => {
      const download = await dependencies.documentDownload.createDownloadUrl({
        bucket: document.bucket,
        fileName: `${document.accessKey}.xml`,
        key: document.objectKey,
      })
      return {
        accessKey: document.accessKey,
        contentType: document.contentType,
        documentId: document.documentId,
        downloadUrl: download.url,
        expiresAt: download.expiresAt,
        sha256: document.sha256,
      }
    }),
  )

  return { items, nextCursor: null }
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

async function runCancel(
  dependencies: {
    readonly fingerprintService: CteIssuanceFingerprintService
    readonly unitOfWork: CteIssuanceUnitOfWorkPort
  },
  input: CteIssuanceCancelInput,
): Promise<CteIssuanceResult> {
  const operation = (transaction: CteIssuanceUnitOfWorkPort) =>
    executeCancel(dependencies.fingerprintService, transaction, input)
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
    batchItemId: input.batchItemId,
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

  const batchStatus = getRequiredString(batch, 'status')
  if (!ISSUABLE_BATCH_STATUSES.includes(batchStatus)) throw createBatchInvalidState()
  if (batchStatus === DRAFT_BATCH_STATUS) {
    await transaction.submitDraftBatch({
      batchId: input.batchId,
      companyId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint,
      userId: input.context.userId,
    })
  }

  const batchItems = await transaction.listIssuableBatchItems({ batchId: input.batchId, companyId })
  const ownedItems = batchItems.filter((item) => item['companyId'] === companyId)
  if (ownedItems.length === 0) throw createNotFound()

  const pendingItems = await collectPendingBatchItems({
    batchId: input.batchId,
    companyId,
    items: ownedItems,
    transaction,
  })
  /** Nenhum item pendente significa lote inteiro em voo ou já autorizado — nada a transmitir. */
  if (pendingItems.length === 0) throw createIssuanceAlreadyInFlight()

  const fiscalSettings = await transaction.findFiscalSettings({ companyId })
  if (fiscalSettings === null) throw createFiscalSequenceMissing()

  const issued: CteIssuanceResult[] = []
  /** Sequencial de propósito: os itens dividem a mesma sequência fiscal, e em paralelo ela corre. */
  for (const pending of pendingItems) {
    issued.push(
      await requestItemIssuance({
        batchItemId: pending.batchItemId,
        currentIssuance: pending.currentIssuance,
        fingerprint,
        fiscalSettings,
        input,
        transaction,
      }),
    )
  }

  const [issuance] = issued
  if (issuance === undefined) throw createIssuanceAlreadyInFlight()
  await transaction.saveIssuanceReplay({
    companyId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: fingerprint,
    response: issuance,
    operation: ISSUE_OPERATION,
  })
  return issuance
}

/** Emissão resolvida ou em voo: repetir reservaria outro número fiscal para o mesmo frete. */
const SETTLED_ISSUANCE_STATUSES: readonly string[] = ['requested', 'authorized', 'cancelled']

type PendingBatchItem = {
  readonly batchItemId: string
  readonly currentIssuance: CteIssuanceIssuanceRecord | null
}

async function collectPendingBatchItems(input: {
  readonly batchId: string
  readonly companyId: string
  readonly items: readonly Record<string, unknown>[]
  readonly transaction: CteIssuanceUnitOfWorkPort
}): Promise<readonly PendingBatchItem[]> {
  const pending: PendingBatchItem[] = []
  for (const item of input.items) {
    const batchItemId = getRequiredString(item, 'id')
    const currentIssuance = await input.transaction.findIssuance({
      batchId: input.batchId,
      batchItemId,
      companyId: input.companyId,
    })
    if (
      currentIssuance !== null &&
      SETTLED_ISSUANCE_STATUSES.includes(currentIssuance.context.status)
    ) {
      continue
    }
    pending.push({ batchItemId, currentIssuance })
  }
  return pending
}

/**
 * O comando chega com uma chave só, mas `cte_issuance_attempts` é única por (empresa, chave) e o
 * lote gera uma tentativa por item: repetir a chave do comando derruba o segundo item com 23505.
 * O replay do comando continua chaveado pela chave crua, em `idempotency_records`, e é ela que
 * volta no `CteIssuanceResult`: quem chamou recebe de volta a chave que mandou.
 */
function buildAttemptIdempotencyKey(input: {
  readonly batchItemId: string
  readonly idempotencyKey: string
}): string {
  return `${input.idempotencyKey}:${input.batchItemId}`
}

async function requestItemIssuance(options: {
  readonly batchItemId: string
  readonly currentIssuance: CteIssuanceIssuanceRecord | null
  readonly fingerprint: string
  readonly fiscalSettings: CteIssuanceFiscalSettings
  readonly input: CteIssuanceIssueInput
  readonly transaction: CteIssuanceUnitOfWorkPort
}): Promise<CteIssuanceResult> {
  const { batchItemId, currentIssuance, fingerprint, fiscalSettings, input, transaction } = options
  const companyId = input.context.companyId

  const reservation = await transaction.reserveFiscalNumber({
    batchItemId,
    batchId: input.batchId,
    companyId,
    environment: fiscalSettings.environment,
    kind: 'issue',
    series: fiscalSettings.series,
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
    fiscalEnvironment: fiscalSettings.environment,
    fiscalSeries: reservation.fiscalSeries,
    fiscalNumber: reservation.fiscalNumber,
    idempotencyKey: buildAttemptIdempotencyKey({
      batchItemId,
      idempotencyKey: input.idempotencyKey,
    }),
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
  await persistIssuancePayload({ batchItemId, issuance, transaction })
  if (issuance.context.status === 'retry_scheduled') {
    const attemptNumber = getRequiredNumber(issuance.context.attemptNumber)
    const attemptsMade = attemptNumber - 1
    const retryPolicy = fiscalSettings.retryPolicy
    await transaction.scheduleRetry({
      attemptId,
      batchId: input.batchId,
      batchItemId,
      companyId,
      status: isCteRetryExhausted({ attemptsMade, policy: retryPolicy })
        ? 'exhausted'
        : 'scheduled',
      attemptCount: attemptNumber,
      maxAttempts: retryPolicy.maxAttempts,
      nextAttemptAt: calculateCteRetryNextAttemptAt({
        attemptsMade,
        now: new Date(),
        policy: retryPolicy,
      }).toISOString(),
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
  const batchItem = await transaction.findBatchItem({
    batchId: input.batchId,
    batchItemId: input.batchItemId,
    companyId,
  })
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
    environment: getRequiredFiscalEnvironment(currentIssuance.context.fiscalEnvironment),
    kind: 'reprocess',
    series: getRequiredString(currentIssuance.context, 'fiscalSeries'),
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
    idempotencyKey: buildAttemptIdempotencyKey({
      batchItemId,
      idempotencyKey: input.idempotencyKey,
    }),
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
  await persistIssuancePayload({ batchItemId, issuance, transaction })

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

async function executeCancel(
  fingerprintService: CteIssuanceFingerprintService,
  transaction: CteIssuanceUnitOfWorkPort,
  input: CteIssuanceCancelInput,
): Promise<CteIssuanceResult> {
  const justification = input.justification.trim()
  if (justification.length < CANCELLATION_JUSTIFICATION_MIN_LENGTH) {
    throw createInvalidJustification()
  }

  const companyId = input.context.companyId
  const batch = await transaction.findBatch({ batchId: input.batchId, companyId })
  if (batch === null || batch['companyId'] !== companyId) throw createNotFound()
  const batchItem = await transaction.findBatchItem({
    batchId: input.batchId,
    batchItemId: input.batchItemId,
    companyId,
  })
  if (batchItem === null || batchItem['companyId'] !== companyId) throw createNotFound()

  const batchItemId = getRequiredString(batchItem, 'id')
  const currentIssuance = await transaction.findIssuance({
    batchId: input.batchId,
    batchItemId,
    companyId,
    includeAuthorized: true,
  })
  if (currentIssuance === null || currentIssuance.context.status !== 'authorized') {
    throw createNotCancellable()
  }
  // Sem protocolo, chave ou reserva não há evento 110111 possível — a SEFAZ exige os três.
  if (
    getOptionalString(currentIssuance.protocol) === undefined ||
    getOptionalString(currentIssuance.accessKey) === undefined ||
    getOptionalString(currentIssuance.reservationId) === undefined
  ) {
    throw createCancellationUnavailable()
  }

  const fingerprint = await fingerprintService.create({
    fields: [
      TEXT_ENCODER.encode(companyId),
      TEXT_ENCODER.encode(input.batchId),
      TEXT_ENCODER.encode(batchItemId),
      TEXT_ENCODER.encode(justification),
    ],
    operation: CANCEL_OPERATION,
  })
  const replay = await transaction.findIssuanceReplay({
    batchId: input.batchId,
    companyId,
    idempotencyKey: input.idempotencyKey,
    operation: CANCEL_OPERATION,
  })
  if (replay !== null) {
    if (replay.requestFingerprint !== fingerprint) throw createIdempotencyConflict()
    return replay.response as CteIssuanceResult
  }

  const attemptNumber = currentIssuance.context.attemptNumber + 1
  const issueRequestedAt = new Date().toISOString()
  const created = await transaction.createIssuance({
    attemptKind: 'cancel',
    attemptNumber,
    batchId: input.batchId,
    batchItemId,
    companyId,
    correlationId: input.correlationId,
    fiscalEnvironment: getRequiredFiscalEnvironment(currentIssuance.context.fiscalEnvironment),
    fiscalSeries: getRequiredString(currentIssuance.context, 'fiscalSeries'),
    fiscalNumber: getRequiredString(currentIssuance.context, 'fiscalNumber'),
    idempotencyKey: buildAttemptIdempotencyKey({
      batchItemId,
      idempotencyKey: input.idempotencyKey,
    }),
    reservationId: getRequiredString(currentIssuance, 'reservationId'),
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
    attemptKind: 'cancel',
  })
  const attemptId = getRequiredString(issuance, 'attemptId')

  await transaction.requestCancellation({
    attemptId,
    batchItemId,
    companyId,
    justification,
    requestedAt: issueRequestedAt,
  })
  await transaction.appendEvent({
    aggregateId: input.batchId,
    attemptId,
    batchItemId,
    companyId,
    eventName: 'cancel_requested',
    payload: {
      batchItemId,
      operation: CANCEL_OPERATION,
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
    eventType: 'transportada.cte.item.cancel.requested',
    attemptKind: 'cancel',
    status: 'requested',
    issueId: attemptId,
    attemptFingerprint: fingerprint,
  })
  await transaction.saveIssuanceReplay({
    companyId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: fingerprint,
    response: issuance,
    operation: CANCEL_OPERATION,
  })
  return issuance
}

async function persistIssuancePayload(input: {
  readonly batchItemId: string
  readonly issuance: CteIssuanceResult
  readonly transaction: CteIssuanceUnitOfWorkPort
}): Promise<void> {
  const { batchItemId, issuance, transaction } = input
  const source = await transaction.findPayloadSource({
    batchId: issuance.batchId,
    batchItemId,
    companyId: issuance.companyId,
  })
  if (source === null) throw new CteIssuancePayloadSourceMissingError()

  await transaction.savePayload(
    assembleCteIssuancePayload({
      attempt: {
        attemptId: issuance.attemptId,
        batchId: issuance.batchId,
        batchItemId,
        companyId: issuance.companyId,
        fiscalEnvironment: issuance.fiscalEnvironment,
        fiscalNumber: issuance.fiscalNumber,
        fiscalSeries: issuance.fiscalSeries,
      },
      source,
    }),
  )
}

function normalizeCreateIssuanceResult(input: {
  readonly companyId: string
  readonly correlationId: string
  readonly created: CteIssuanceCreatedAttempt
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
  const reservationNumber = input.created.fiscalNumber
  const reservationSeries = input.created.fiscalSeries
  const fiscalEnvironment = input.created.fiscalEnvironment
  const attemptId = input.created.attemptId

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
    value === 'failed' ||
    value === 'cancelled'
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
  if (value === 'issue' || value === 'reprocess' || value === 'cancel') return value
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

function createBatchInvalidState(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_INVALID_STATE',
    message: 'CT-e batch state transition is not allowed',
    status: 409,
  })
}

function createIssuanceAlreadyInFlight(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_ALREADY_IN_FLIGHT',
    message: 'CT-e issuance is already in progress for this batch',
    status: 409,
  })
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

function createNotCancellable(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_NOT_CANCELLABLE',
    message: 'CT-e issuance cannot be cancelled',
    status: 409,
  })
}

function createCancellationUnavailable(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_CANCELLATION_UNAVAILABLE',
    message: 'CT-e issuance has no authorization data to cancel',
    status: 422,
  })
}

function createInvalidJustification(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_INVALID_JUSTIFICATION',
    message: 'CT-e cancellation justification must have at least 15 characters',
    status: 400,
  })
}

function createFiscalSequenceMissing(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_FISCAL_SEQUENCE_MISSING',
    message: 'Company has no CT-e fiscal sequence configured',
    status: 422,
  })
}

function createInvalidState(): ApiError {
  return new ApiError({
    code: 'CTE_ISSUANCE_INVALID_STATE',
    message: 'CT-e issuance is in an invalid state',
    status: 409,
  })
}
