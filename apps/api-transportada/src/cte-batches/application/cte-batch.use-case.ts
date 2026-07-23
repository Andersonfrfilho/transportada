/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

const TEXT_ENCODER = new TextEncoder()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CteBatchStatus = 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'

type CteBatchContext = {
  readonly companyId: string
  readonly userId: string
}

type CteBatchRecord = Record<string, unknown> & {
  readonly companyId?: unknown
  readonly id?: unknown
  readonly status?: unknown
}

type CteBatchFingerprintPort = {
  create(input: unknown): Promise<string> | string
}

type CteBatchUnitOfWorkPort = {
  createBatch(input: Record<string, unknown>): Promise<Record<string, unknown>>
  createBatchEvent(input: Record<string, unknown>): Promise<void>
  createBatchItem(input: Record<string, unknown>): Promise<void>
  execute?<TResponse>(
    operation: (transaction: CteBatchUnitOfWorkPort) => Promise<TResponse>,
  ): Promise<TResponse>
  createSubmissionRecord(input: Record<string, unknown>): Promise<void>
  findBatch(input: Record<string, unknown>): Promise<CteBatchRecord | null>
  findBatchByIdempotency(input: Record<string, unknown>): Promise<Record<string, unknown> | null>
  findEligibleDocument(input: Record<string, unknown>): Promise<Record<string, unknown> | null>
  findFreightCalculation(input: Record<string, unknown>): Promise<Record<string, unknown> | null>
  findSubmissionRecord(input: Record<string, unknown>): Promise<Record<string, unknown> | null>
  updateBatchStatus(input: Record<string, unknown>): Promise<Record<string, unknown>>
}

export type CreateCteBatchInput = {
  readonly context: CteBatchContext
  readonly correlationId: string
  readonly documentIds: readonly string[]
  readonly idempotencyKey: string
  readonly name: string
}

export type SubmitCteBatchInput = {
  readonly batchId: string
  readonly context: CteBatchContext
  readonly correlationId: string
  readonly idempotencyKey: string
}

export type CteBatchLookupInput = {
  readonly batchId: string
  readonly context: CteBatchContext
}

export type TransitionCteBatchInput = {
  readonly batchId: string
  readonly context: CteBatchContext
  readonly correlationId: string
  readonly nextStatus: CteBatchStatus
}

export function createCteBatchUseCase(dependencies: {
  readonly fingerprintService: CteBatchFingerprintPort
  readonly unitOfWork: CteBatchUnitOfWorkPort
}): {
  readonly cancel: (
    input: CteBatchLookupInput & { readonly correlationId: string },
  ) => Promise<Record<string, unknown>>
  readonly create: (input: CreateCteBatchInput) => Promise<Record<string, unknown>>
  readonly get: (input: CteBatchLookupInput) => Promise<Record<string, unknown>>
  readonly submit: (input: SubmitCteBatchInput) => Promise<Record<string, unknown>>
  readonly transition: (input: TransitionCteBatchInput) => Promise<Record<string, unknown>>
} {
  return {
    cancel: (input) => cancelBatch(dependencies, input),
    create: (input) => createBatch(dependencies, input),
    get: (input) => getBatch(dependencies.unitOfWork, input),
    submit: (input) => submitBatch(dependencies, input),
    transition: (input) => transitionBatch(dependencies, input),
  }
}

async function createBatch(
  dependencies: {
    readonly fingerprintService: CteBatchFingerprintPort
    readonly unitOfWork: CteBatchUnitOfWorkPort
  },
  input: CreateCteBatchInput,
): Promise<Record<string, unknown>> {
  const documentId = resolveDocumentId(input.documentIds[0] ?? '')
  const fingerprint = await createFingerprint(dependencies.fingerprintService, 'cte-batch.create', [
    input.context.companyId,
    input.name,
    documentId,
  ])
  const operation = async (transaction: CteBatchUnitOfWorkPort) => {
    const replay = await transaction.findBatchByIdempotency({
      companyId: input.context.companyId,
      idempotencyKey: input.idempotencyKey,
    })
    if (replay !== null) return resolveCreateReplay(replay, fingerprint)

    const document = await findEligibleDocument(transaction, input.context.companyId, documentId)
    const calculation = await findEligibleCalculation(
      transaction,
      input.context.companyId,
      documentId,
    )
    const batch = await transaction.createBatch({
      companyId: input.context.companyId,
      correlationId: input.correlationId,
      idempotencyFingerprint: fingerprint,
      idempotencyKey: input.idempotencyKey,
      name: input.name,
      operatorUserId: input.context.userId,
      status: 'draft',
      version: '1',
    })

    await transaction.createBatchItem({
      batchId: getRequiredString(batch, 'id'),
      calculationSnapshot: getRequiredRecord(calculation, 'calculationSnapshot'),
      companyId: input.context.companyId,
      freightCalculationId: getRequiredString(calculation, 'id'),
      nfeDocumentId: getRequiredString(document, 'id'),
      position: '1',
    })
    await appendEvent(transaction, {
      batchId: getRequiredString(batch, 'id'),
      companyId: input.context.companyId,
      eventName: 'created',
      payload: {
        documentIds: [documentId],
        itemCount: 1,
        status: 'draft',
      },
      userId: input.context.userId,
    })

    return batch
  }

  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function submitBatch(
  dependencies: {
    readonly fingerprintService: CteBatchFingerprintPort
    readonly unitOfWork: CteBatchUnitOfWorkPort
  },
  input: SubmitCteBatchInput,
): Promise<Record<string, unknown>> {
  const fingerprint = await createFingerprint(dependencies.fingerprintService, 'cte-batch.submit', [
    input.context.companyId,
    input.batchId,
  ])
  const operation = async (transaction: CteBatchUnitOfWorkPort) => {
    const replay = await transaction.findSubmissionRecord({
      batchId: input.batchId,
      companyId: input.context.companyId,
      idempotencyKey: input.idempotencyKey,
    })
    if (replay !== null) return resolveSubmissionReplay(replay, fingerprint)

    const batch = await getBatch(transaction, input)
    assertTransition(getStatus(batch), 'submitted')
    await transaction.createSubmissionRecord({
      batchId: input.batchId,
      companyId: input.context.companyId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: fingerprint,
      result: null,
      submissionStatus: 'pending',
    })

    return updateStatus(transaction, {
      batch,
      batchId: input.batchId,
      companyId: input.context.companyId,
      nextStatus: 'submitted',
      userId: input.context.userId,
    })
  }

  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function cancelBatch(
  dependencies: {
    readonly unitOfWork: CteBatchUnitOfWorkPort
  },
  input: CteBatchLookupInput & { readonly correlationId: string },
): Promise<Record<string, unknown>> {
  const operation = async (transaction: CteBatchUnitOfWorkPort) => {
    const batch = await getBatch(transaction, input)
    assertTransition(getStatus(batch), 'cancelled')

    return updateStatus(transaction, {
      batch,
      batchId: input.batchId,
      companyId: input.context.companyId,
      nextStatus: 'cancelled',
      userId: input.context.userId,
    })
  }

  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function transitionBatch(
  dependencies: {
    readonly unitOfWork: CteBatchUnitOfWorkPort
  },
  input: TransitionCteBatchInput,
): Promise<Record<string, unknown>> {
  const operation = async (transaction: CteBatchUnitOfWorkPort) => {
    const batch = await getBatch(transaction, input)
    assertTransition(getStatus(batch), input.nextStatus)

    return updateStatus(transaction, {
      batch,
      batchId: input.batchId,
      companyId: input.context.companyId,
      nextStatus: input.nextStatus,
      userId: input.context.userId,
    })
  }

  return dependencies.unitOfWork.execute?.(operation) ?? operation(dependencies.unitOfWork)
}

async function getBatch(
  unitOfWork: CteBatchUnitOfWorkPort,
  input: CteBatchLookupInput,
): Promise<Record<string, unknown>> {
  const batch = await unitOfWork.findBatch({
    batchId: input.batchId,
    companyId: input.context.companyId,
  })
  if (batch === null || batch.companyId !== input.context.companyId) throw createNotFoundError()

  return batch
}

async function findEligibleDocument(
  unitOfWork: CteBatchUnitOfWorkPort,
  companyId: string,
  documentId: string,
): Promise<Record<string, unknown>> {
  const document = await unitOfWork.findEligibleDocument({ companyId, documentId })
  if (document === null) throw createDocumentNotEligibleError()
  if (document['companyId'] !== companyId) throw createDocumentNotEligibleError()
  if (document['status'] !== 'authorized') throw createDocumentNotEligibleError()
  if (document['variant'] !== 'complete') throw createDocumentNotEligibleError()

  return document
}

async function findEligibleCalculation(
  unitOfWork: CteBatchUnitOfWorkPort,
  companyId: string,
  documentId: string,
): Promise<Record<string, unknown>> {
  const calculation = await unitOfWork.findFreightCalculation({ companyId, documentId })
  if (calculation === null) throw createDocumentNotEligibleError()
  if (calculation['companyId'] !== companyId) throw createDocumentNotEligibleError()
  if (calculation['status'] !== 'snapshotted') throw createDocumentNotEligibleError()

  return calculation
}

async function updateStatus(
  unitOfWork: CteBatchUnitOfWorkPort,
  input: {
    readonly batch: Record<string, unknown>
    readonly batchId: string
    readonly companyId: string
    readonly nextStatus: CteBatchStatus
    readonly userId: string
  },
): Promise<Record<string, unknown>> {
  const previousStatus = getStatus(input.batch)
  const updatedBatch = await unitOfWork.updateBatchStatus({
    batchId: input.batchId,
    companyId: input.companyId,
    expectedStatus: previousStatus,
    nextStatus: input.nextStatus,
  })
  await appendEvent(unitOfWork, {
    batchId: input.batchId,
    companyId: input.companyId,
    eventName: input.nextStatus,
    payload: {
      previousStatus,
      status: input.nextStatus,
    },
    userId: input.userId,
  })

  return updatedBatch
}

async function appendEvent(
  unitOfWork: CteBatchUnitOfWorkPort,
  event: Record<string, unknown>,
): Promise<void> {
  await unitOfWork.createBatchEvent(event)
}

async function createFingerprint(
  fingerprintService: CteBatchFingerprintPort,
  operation: string,
  values: readonly string[],
): Promise<string> {
  return fingerprintService.create({
    fields: values.map((value) => TEXT_ENCODER.encode(value)),
    operation,
  })
}

function resolveSubmissionReplay(
  replay: Record<string, unknown>,
  fingerprint: string,
): Record<string, unknown> {
  if (replay['requestFingerprint'] !== fingerprint) throw createIdempotencyConflict()
  return getRequiredRecord(replay, 'batch')
}

function resolveCreateReplay(
  replay: Record<string, unknown>,
  fingerprint: string,
): Record<string, unknown> {
  if (replay['idempotencyFingerprint'] !== fingerprint) throw createIdempotencyConflict()
  return getRequiredRecord(replay, 'batch')
}

function assertTransition(currentStatus: CteBatchStatus, nextStatus: CteBatchStatus): void {
  const allowedTransitions: Readonly<Record<CteBatchStatus, readonly CteBatchStatus[]>> = {
    cancelled: [],
    done: [],
    draft: ['cancelled', 'submitted'],
    error: [],
    in_flight: ['done', 'error'],
    submitted: ['cancelled', 'in_flight'],
  }
  if (!allowedTransitions[currentStatus].includes(nextStatus)) throw createInvalidStateError()
}

function getStatus(batch: Record<string, unknown>): CteBatchStatus {
  const status = batch['status']
  if (
    status === 'draft' ||
    status === 'submitted' ||
    status === 'in_flight' ||
    status === 'done' ||
    status === 'error' ||
    status === 'cancelled'
  ) {
    return status
  }

  throw createInvalidStateError()
}

function getRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.length === 0) throw createInvalidStateError()

  return value
}

function getRequiredRecord(
  record: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = record[field]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw createInvalidStateError()
  }

  return value as Record<string, unknown>
}

function resolveDocumentId(documentId: string): string {
  if (documentId.startsWith('nfe-') || UUID_PATTERN.test(documentId)) return documentId
  throw createDocumentNotEligibleError()
}

function createDocumentNotEligibleError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_DOCUMENT_NOT_ELIGIBLE',
    message: 'NF-e is not eligible for CT-e batch',
    status: 409,
  })
}

function createIdempotencyConflict(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

function createInvalidStateError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_INVALID_STATE',
    message: 'CT-e batch state transition is not allowed',
    status: 409,
  })
}

function createNotFoundError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_NOT_FOUND',
    message: 'CT-e batch was not found',
    status: 404,
  })
}
