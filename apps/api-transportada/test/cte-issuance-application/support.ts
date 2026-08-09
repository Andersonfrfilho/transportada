/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { expect } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { cteIssuanceAttempts } from '../../src/database/database.schema.js'
import type { CteIssuanceCreatedAttempt } from '../../src/cte-issuance/application/cte-issuance.use-case.js'
import type { CteIssuancePayloadSource } from '../../src/cte-issuance/application/cte-issuance-payload.port.js'
import { mapCteIssuanceAttempt } from '../../src/cte-issuance/infrastructure/cte-issuance-attempt.mapper.js'
import type { CteRetryPolicy } from '../../src/cte-issuance/domain/cte-retry.policy.js'
import { GROUPED_INVOICES } from '../cte-issuance-domain/grouped.support.js'
import { GOLDEN_CHARGE, GOLDEN_INVOICE, GOLDEN_PROFILE } from '../cte-issuance-domain/support.js'

export type CteIssuanceFiscalSettings = {
  readonly environment: 'homologation' | 'production'
  readonly retryPolicy: CteRetryPolicy
  readonly series: string
}

export const DEFAULT_RETRY_POLICY: CteRetryPolicy = {
  backoffSeconds: [5, 30, 300],
  maxAttempts: 3,
}

export type CteIssuanceStatus =
  | 'requested'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'
  | 'cancelled'

export type CteIssuanceRecord = {
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
    readonly reasonCode?: string
    readonly reasonCause?: string
    readonly retryCount: number
    readonly attemptKind: 'issue' | 'reprocess' | 'cancel'
    readonly attemptNumber: number
    readonly correlationId: string
    readonly idempotencyKey: string
    readonly fingerprint: string
  }
  readonly protocol?: string
  readonly accessKey?: string
  readonly issueRequestedAt?: string
}

export type CteDocumentPageContract = {
  readonly items: readonly Record<string, unknown>[]
  readonly nextCursor: string | null
}

export type CteIssuanceUseCaseContract = {
  readonly issue: (input: unknown) => Promise<unknown>
  readonly reprocess: (input: unknown) => Promise<unknown>
  readonly cancel: (input: unknown) => Promise<unknown>
  readonly getIssuance: (input: unknown) => Promise<unknown>
  readonly listDocuments: (input: unknown) => Promise<CteDocumentPageContract>
}

export type CteIssuanceUseCaseFactory = (input: {
  readonly documentDownload: CteIssuanceUnitOfWorkFixture
  readonly fingerprintService: CteIssuanceFingerprintService
  readonly unitOfWork: CteIssuanceUnitOfWorkFixture
}) => CteIssuanceUseCaseContract

export type CteIssuanceFingerprintService = {
  readonly create: (input: unknown) => Promise<string> | string
}

export type CteIssuanceIssueInput = {
  readonly context: {
    readonly companyId: string
    readonly kind: 'company'
    readonly membershipId: string
    readonly permissions: Set<string>
    readonly roles: readonly string[]
    readonly userId: string
  }
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly batchId: string
}

export type CteIssuanceReprocessInput = {
  readonly context: CteIssuanceIssueInput['context']
  readonly batchId: string
  readonly batchItemId: string
  readonly correlationId: string
  readonly idempotencyKey: string
}

export type CteIssuanceCancelInput = CteIssuanceReprocessInput & {
  readonly justification: string
}

export const COMPANY_CONTEXT = {
  companyId: 'company-001',
  kind: 'company' as const,
  membershipId: 'membership-001',
  permissions: new Set(['cte.read', 'cte.manage', 'cte.submit']),
  roles: ['company-admin'],
  userId: 'user-001',
}

export const CORRELATION_ID = 'correlation-001'
export const BATCH_ID = 'cte-batch-001'
export const BATCH_ITEM_ID = 'cte-batch-item-001'
export const OTHER_BATCH_ID = 'cte-batch-002'
export const OTHER_BATCH_ITEM_ID = 'cte-batch-item-002'
/** Segundo item do MESMO lote: é ele que a emissão em lote não podia esquecer. */
export const SIBLING_BATCH_ITEM_ID = 'cte-batch-item-003'
export const IDEMPOTENCY_KEY = 'cte-issue-idempotency-001'
export const REPROCESS_IDEMPOTENCY_KEY = 'cte-reprocess-idempotency-001'
export const CANCEL_IDEMPOTENCY_KEY = 'cte-cancel-idempotency-001'
export const ISSUE_FINGERPRINT = 'cte-issue-fingerprint-001'
export const REPROCESS_FINGERPRINT = 'cte-reprocess-fingerprint-001'
export const CANCEL_FINGERPRINT = 'cte-cancel-fingerprint-001'
export const CANCEL_JUSTIFICATION = 'Prestacao de servico nao realizada pelo tomador'
export const AUTHORIZED_ACCESS_KEY = '35260712345678000190570070000000011000000019'
export const AUTHORIZED_PROTOCOL = '135260000123456'
export const AUTHORIZED_RESERVATION_ID = '00000000-0000-4000-8000-0000000000ff'

export const PAYLOAD_EMITTER = {
  city: 'Taubate',
  cityIbgeCode: '3554102',
  cnpj: '12345678000195',
  complement: 'SALA 12',
  district: 'CENTRO',
  legalName: 'TRANSPORTADORA TRANSPORTADA LTDA',
  number: '100',
  phone: '1233334444',
  postalCode: '12010000',
  rntrc: '58151044',
  state: 'SP',
  stateRegistration: '688292870119',
  street: 'AVENIDA DO PORTO',
  taxRegime: '1',
  tradeName: 'TRANSPORTADA',
} as const

export const PAYLOAD_SOURCE: CteIssuancePayloadSource = {
  charge: GOLDEN_CHARGE,
  emitter: PAYLOAD_EMITTER,
  invoices: [GOLDEN_INVOICE],
  profile: GOLDEN_PROFILE,
}

export const GROUPED_PAYLOAD_SOURCE: CteIssuancePayloadSource = {
  ...PAYLOAD_SOURCE,
  invoices: GROUPED_INVOICES,
}

export const SIGNED_URL_EXPIRES_AT = '2026-07-27T20:15:00.000Z'

export const FISCAL_DOCUMENT_RECORD = {
  accessKey: '35260712345678000190570070000000011000000019',
  bucket: 'transportada-fiscal',
  contentType: 'application/xml',
  documentId: 'cte-fiscal-document-001',
  objectKey: 'cte-document-001',
  sha256: 'c'.repeat(64),
} as const

export const ISSUE_COMMAND_RESULT = {
  attemptId: 'attempt-001',
  attemptKind: 'issue',
  attemptNumber: 1,
  batchId: BATCH_ID,
  batchItemId: BATCH_ITEM_ID,
  companyId: COMPANY_CONTEXT.companyId,
  fiscalEnvironment: 'homologation',
  fiscalSeries: '1',
  fiscalNumber: '100000001',
  idempotencyKey: IDEMPOTENCY_KEY,
  status: 'requested',
} as const

export const AUTHORIZED_ISSUANCE: CteIssuanceRecord = {
  attemptId: ISSUE_COMMAND_RESULT.attemptId,
  batchId: BATCH_ID,
  companyId: COMPANY_CONTEXT.companyId,
  reservationId: AUTHORIZED_RESERVATION_ID,
  context: {
    batchItemId: BATCH_ITEM_ID,
    companyId: COMPANY_CONTEXT.companyId,
    fiscalEnvironment: 'homologation',
    fiscalNumber: '100000001',
    fiscalSeries: '1',
    status: 'authorized',
    retryCount: 0,
    attemptKind: 'issue',
    attemptNumber: 1,
    correlationId: CORRELATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    fingerprint: ISSUE_FINGERPRINT,
  },
  accessKey: AUTHORIZED_ACCESS_KEY,
  protocol: AUTHORIZED_PROTOCOL,
  issueRequestedAt: '2026-07-27T18:00:00.000Z',
}

type PersistedAttemptRecord = typeof cteIssuanceAttempts.$inferSelect

function readAttemptKind(value: unknown): 'issue' | 'reprocess' | 'cancel' {
  if (value === 'issue' || value === 'reprocess' || value === 'cancel') return value
  throw new Error('createIssuance recebeu attemptKind fora do contrato')
}

function readFiscalEnvironment(value: unknown): 'homologation' | 'production' {
  if (value === 'homologation' || value === 'production') return value
  throw new Error('createIssuance recebeu fiscalEnvironment fora do contrato')
}

function readAttemptNumber(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('createIssuance recebeu attemptNumber fora do contrato')
  }
  return BigInt(value)
}

function readOptionalText(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function readText(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`createIssuance recebeu ${key} fora do contrato`)
  }
  return value
}

/** Espelha a linha gravada em `cte_issuance_attempts` para o fixture usar o mapper de produção. */
export function buildPersistedAttemptRecord(
  input: Record<string, unknown>,
): PersistedAttemptRecord {
  const persistedAt = new Date(readText(input, 'issueRequestedAt'))
  return {
    attemptKind: readAttemptKind(input['attemptKind']),
    attemptNumber: readAttemptNumber(input['attemptNumber']),
    batchId: readText(input, 'batchId'),
    batchItemId: readText(input, 'batchItemId'),
    companyId: readText(input, 'companyId'),
    correlationId: readText(input, 'correlationId'),
    createdAt: persistedAt,
    fiscalEnvironment: readFiscalEnvironment(input['fiscalEnvironment']),
    fiscalNumber: BigInt(readText(input, 'fiscalNumber')),
    fiscalSeries: readText(input, 'fiscalSeries'),
    id: ISSUE_COMMAND_RESULT.attemptId,
    idempotencyFingerprint: ISSUE_FINGERPRINT,
    idempotencyKey: readText(input, 'idempotencyKey'),
    lastErrorCause: null,
    lastErrorCode: null,
    requestFingerprint: ISSUE_FINGERPRINT,
    reservationId: readOptionalText(input, 'reservationId') ?? AUTHORIZED_RESERVATION_ID,
    status: 'in_flight',
    updatedAt: persistedAt,
  }
}

export async function createCteIssuanceUseCaseForTest(
  unitOfWork: CteIssuanceUnitOfWorkFixture,
  issueFingerprint = ISSUE_FINGERPRINT,
): Promise<CteIssuanceUseCaseContract> {
  let moduleExports: Record<string, unknown>

  try {
    moduleExports = (await import(
      '../../src/cte-issuance/application/cte-issuance.use-case.js'
    )) as Record<string, unknown>
  } catch (error) {
    throw new Error(`T006 application implementation is missing: ${String(error)}`)
  }

  const factory = moduleExports['createCteIssuanceUseCase'] as CteIssuanceUseCaseFactory | undefined
  expect(typeof factory).toBe('function')
  if (factory === undefined) throw new Error('CT-e issuance use case factory is missing')

  return factory({
    documentDownload: unitOfWork,
    fingerprintService: new CteIssuanceFingerprintFixture(issueFingerprint),
    unitOfWork,
  })
}

export class CteIssuanceFingerprintFixture {
  public readonly payloads: readonly unknown[] = []
  private readonly fingerprint: string

  public constructor(fingerprint: string) {
    this.fingerprint = fingerprint
  }

  public create(payload: unknown): string {
    ;(this.payloads as unknown[]).push(payload)
    return this.fingerprint
  }
}

export class CteIssuanceUnitOfWorkFixture {
  public readonly issueIdempotencyQueries: Array<Record<string, unknown>> = []
  public readonly batchQueries: Array<Record<string, unknown>> = []
  public readonly batchItemQueries: Array<Record<string, unknown>> = []
  public readonly commandOutbox: Array<Record<string, unknown>> = []
  public readonly events: Array<Record<string, unknown>> = []
  public readonly attempts: Array<Record<string, unknown>> = []
  public readonly retries: Array<Record<string, unknown>> = []
  public readonly executedTransactions: Array<'cte-issuance'> = []
  public readonly lookupQueries: Array<Record<string, unknown>> = []
  public readonly payloadSourceQueries: Array<Record<string, unknown>> = []
  public readonly savedPayloads: Array<Record<string, unknown>> = []
  public readonly fiscalSettingsQueries: Array<Record<string, unknown>> = []
  public readonly reservations: Array<Record<string, unknown>> = []
  public readonly fiscalDocumentQueries: Array<Record<string, unknown>> = []
  public readonly downloadRequests: Array<Record<string, unknown>> = []
  public readonly cancellationRequests: Array<Record<string, unknown>> = []
  public readonly draftSubmissions: Array<Record<string, unknown>> = []

  public fiscalDocuments: readonly Record<string, unknown>[] = [{ ...FISCAL_DOCUMENT_RECORD }]

  public payloadSource: CteIssuancePayloadSource | null = PAYLOAD_SOURCE
  public fiscalSettings: CteIssuanceFiscalSettings | null = {
    environment: 'homologation',
    retryPolicy: DEFAULT_RETRY_POLICY,
    series: '1',
  }

  public batch: Record<string, unknown> | null = {
    companyId: COMPANY_CONTEXT.companyId,
    id: BATCH_ID,
    status: 'submitted',
  }
  public batchItem: Record<string, unknown> | null = {
    id: BATCH_ITEM_ID,
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    status: 'approved',
  }
  /** Nulo mantém o lote de um item só; preenchido descreve o lote inteiro, na ordem de `position`. */
  public batchItems: readonly Record<string, unknown>[] | null = null
  /** Emissão corrente por item — sem isso o fake responderia o mesmo estado para o lote todo. */
  public readonly issuanceByItemId = new Map<string, CteIssuanceRecord | null>()
  public issueReplay: { readonly requestFingerprint: string; readonly response: unknown } | null =
    null
  public reprocessReplay: {
    readonly requestFingerprint: string
    readonly response: unknown
  } | null = null
  public cancelReplay: {
    readonly requestFingerprint: string
    readonly response: unknown
  } | null = null
  public issuanceResult: CteIssuanceRecord | null = null
  public rejectedIssuance: CteIssuanceRecord | null = {
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    context: {
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: '100000001',
      fiscalSeries: '1',
      status: 'rejected',
      reasonCode: 'FISCAL_REJECTION',
      reasonCause: 'Rejected by SEFAZ',
      retryCount: 0,
      attemptKind: 'issue',
      attemptNumber: 1,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      fingerprint: ISSUE_FINGERPRINT,
    },
  }
  public retryIssuance: CteIssuanceRecord | null = {
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    context: {
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: '100000002',
      fiscalSeries: '1',
      status: 'retry_scheduled',
      reasonCode: 'TECHNICAL_TIMEOUT',
      reasonCause: 'provider timeout',
      retryCount: 1,
      attemptKind: 'issue',
      attemptNumber: 2,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      fingerprint: ISSUE_FINGERPRINT,
    },
    issueRequestedAt: '2026-07-22T20:00:00.000Z',
  }
  public failedIssuance: CteIssuanceRecord | null = {
    batchId: BATCH_ID,
    companyId: COMPANY_CONTEXT.companyId,
    context: {
      batchItemId: BATCH_ITEM_ID,
      companyId: COMPANY_CONTEXT.companyId,
      fiscalEnvironment: 'homologation',
      fiscalNumber: '100000003',
      fiscalSeries: '1',
      status: 'failed',
      reasonCode: 'UNRECOVERABLE',
      reasonCause: 'permanent storage failure',
      retryCount: 3,
      attemptKind: 'issue',
      attemptNumber: 2,
      correlationId: CORRELATION_ID,
      idempotencyKey: IDEMPOTENCY_KEY,
      fingerprint: ISSUE_FINGERPRINT,
    },
  }

  public async execute<TResponse>(
    operation: (transaction: CteIssuanceUnitOfWorkFixture) => Promise<TResponse>,
  ): Promise<TResponse> {
    this.executedTransactions.push('cte-issuance')
    return operation(this)
  }

  public async findBatch(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    this.batchQueries.push(input)
    return this.batch
  }

  public async findBatchItem(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    this.batchItemQueries.push(input)
    const requestedItemId = input['batchItemId']
    if (typeof requestedItemId === 'string' && this.batchItem?.['id'] !== requestedItemId) {
      return null
    }
    return this.batchItem
  }

  public async listIssuableBatchItems(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    this.batchItemQueries.push(input)
    if (this.batchItems !== null) return this.batchItems
    return this.batchItem === null ? [] : [this.batchItem]
  }

  public async listFiscalDocuments(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    this.fiscalDocumentQueries.push(input)
    return this.fiscalDocuments
  }

  public async createDownloadUrl(input: {
    readonly bucket: string
    readonly key: string
  }): Promise<{ readonly expiresAt: string; readonly url: string }> {
    this.downloadRequests.push(input)
    return {
      expiresAt: SIGNED_URL_EXPIRES_AT,
      url: `https://storage.local/signed/${input.key}?signature=stub`,
    }
  }

  public async findIssuanceReplay(input: Record<string, unknown>): Promise<{
    readonly requestFingerprint: string
    readonly response: unknown
  } | null> {
    this.issueIdempotencyQueries.push(input)
    if (input['idempotencyKey'] === IDEMPOTENCY_KEY) return this.issueReplay
    if (input['idempotencyKey'] === REPROCESS_IDEMPOTENCY_KEY) return this.reprocessReplay
    if (input['idempotencyKey'] === CANCEL_IDEMPOTENCY_KEY) return this.cancelReplay
    return null
  }

  public async saveIssuanceReplay(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly requestFingerprint: string
    readonly response: unknown
  }): Promise<void> {
    if (input.idempotencyKey === IDEMPOTENCY_KEY) {
      this.issueReplay = { requestFingerprint: input.requestFingerprint, response: input.response }
    } else if (input.idempotencyKey === CANCEL_IDEMPOTENCY_KEY) {
      this.cancelReplay = { requestFingerprint: input.requestFingerprint, response: input.response }
    } else {
      this.reprocessReplay = {
        requestFingerprint: input.requestFingerprint,
        response: input.response,
      }
    }
  }

  public async findIssuance(input: Record<string, unknown>): Promise<CteIssuanceRecord | null> {
    this.lookupQueries.push(input)
    const batchItemId = input['batchItemId']
    if (typeof batchItemId === 'string' && this.issuanceByItemId.has(batchItemId)) {
      return this.issuanceByItemId.get(batchItemId) ?? null
    }
    if (input['includeRejected']) return this.rejectedIssuance
    if (input['includeRetry']) return this.retryIssuance
    if (input['includeFailed']) return this.failedIssuance
    if (input['includeAuthorized'] || input['includeReplay']) {
      return this.issuanceResult
    }
    return this.issuanceResult
  }

  public async createIssuance(input: Record<string, unknown>): Promise<CteIssuanceCreatedAttempt> {
    this.attempts.push(input)
    return mapCteIssuanceAttempt(buildPersistedAttemptRecord(input))
  }

  public async findFiscalSettings(
    input: Record<string, unknown>,
  ): Promise<CteIssuanceFiscalSettings | null> {
    this.fiscalSettingsQueries.push(input)
    return this.fiscalSettings
  }

  public async reserveFiscalNumber(input: Record<string, unknown>): Promise<{
    readonly id: string
    readonly fiscalSeries: string
    readonly fiscalNumber: string
    readonly companyId: string
  }> {
    this.reservations.push(input)
    return {
      id: 'reservation-001',
      companyId: input['companyId'] as string,
      fiscalSeries: input['series'] as string,
      fiscalNumber: input['kind'] === 'reprocess' ? '100000002' : '100000001',
    }
  }

  public async findPayloadSource(
    input: Record<string, unknown>,
  ): Promise<CteIssuancePayloadSource | null> {
    this.payloadSourceQueries.push(input)
    return this.payloadSource
  }

  public async savePayload(input: Record<string, unknown>): Promise<void> {
    this.savedPayloads.push(input)
  }

  public async submitDraftBatch(input: Record<string, unknown>): Promise<void> {
    this.draftSubmissions.push(input)
    this.batch = { ...(this.batch ?? {}), status: 'submitted' }
  }

  public async requestCancellation(input: Record<string, unknown>): Promise<void> {
    this.cancellationRequests.push(input)
  }

  public async scheduleRetry(input: Record<string, unknown>): Promise<void> {
    this.retries.push(input)
  }

  public async appendEvent(input: Record<string, unknown>): Promise<void> {
    this.events.push(input)
  }

  public async pushOutbox(input: Record<string, unknown>): Promise<void> {
    this.commandOutbox.push(input)
  }
}

export async function captureApiError(callback: () => Promise<unknown>): Promise<ApiError> {
  try {
    await callback()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('Expected ApiError to be thrown')
}
