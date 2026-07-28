/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  createIdempotencyConflictError,
  createInvalidStateError,
  createItemNotFoundError,
  createNotFoundError,
} from '../domain/cte-batch.error.js'
import type { CteEmissionProfileCatalogPort } from './cte-batch-preview.port.js'
import { getRequiredRecord } from './cte-batch-record.service.js'
import type {
  CreateCteBatchInput,
  CteBatchContext,
  CteBatchFingerprintPort,
  CteBatchLookupInput,
  CteBatchStatus,
  CteBatchUnitOfWorkPort,
  RemoveCteBatchItemInput,
  SubmitCteBatchInput,
  TransitionCteBatchInput,
} from './cte-batch.port.js'
import { createCteBatch } from './create-cte-batch.service.js'

const TEXT_ENCODER = new TextEncoder()
const SUBMIT_FINGERPRINT_OPERATION = 'cte-batch.submit'
const ITEM_REMOVED_OPERATION = 'item_removed'
const DRAFT_STATUS = 'draft'

const ALLOWED_TRANSITIONS: Readonly<Record<CteBatchStatus, readonly CteBatchStatus[]>> = {
  cancelled: [],
  done: [],
  draft: ['cancelled', 'submitted'],
  error: [],
  in_flight: ['done', 'error'],
  submitted: ['cancelled', 'in_flight'],
}

type Dependencies = {
  readonly fingerprintService: CteBatchFingerprintPort
  readonly profiles: CteEmissionProfileCatalogPort
  readonly unitOfWork: CteBatchUnitOfWorkPort
}

export type {
  CreateCteBatchInput,
  CteBatchLookupInput,
  RemoveCteBatchItemInput,
  SubmitCteBatchInput,
  TransitionCteBatchInput,
}

export function createCteBatchUseCase(dependencies: Dependencies): {
  readonly cancel: (
    input: CteBatchLookupInput & { readonly correlationId: string },
  ) => Promise<Record<string, unknown>>
  readonly create: (input: CreateCteBatchInput) => Promise<Record<string, unknown>>
  readonly get: (input: CteBatchLookupInput) => Promise<Record<string, unknown>>
  readonly removeItem: (input: RemoveCteBatchItemInput) => Promise<Record<string, unknown>>
  readonly submit: (input: SubmitCteBatchInput) => Promise<Record<string, unknown>>
  readonly transition: (input: TransitionCteBatchInput) => Promise<Record<string, unknown>>
} {
  return {
    cancel: (input) => changeStatus(dependencies.unitOfWork, input, 'cancelled'),
    create: (input) => createCteBatch(dependencies, input),
    get: (input) => getBatch(dependencies.unitOfWork, input),
    removeItem: (input) => removeBatchItem(dependencies.unitOfWork, input),
    submit: (input) => submitBatch(dependencies, input),
    transition: (input) => changeStatus(dependencies.unitOfWork, input, input.nextStatus),
  }
}

async function submitBatch(
  dependencies: Dependencies,
  input: SubmitCteBatchInput,
): Promise<Record<string, unknown>> {
  const fingerprint = await dependencies.fingerprintService.create({
    fields: [input.context.companyId, input.batchId].map((value) => TEXT_ENCODER.encode(value)),
    operation: SUBMIT_FINGERPRINT_OPERATION,
  })
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

async function changeStatus(
  unitOfWork: CteBatchUnitOfWorkPort,
  input: { readonly batchId: string; readonly context: CteBatchContext },
  nextStatus: CteBatchStatus,
): Promise<Record<string, unknown>> {
  const operation = async (transaction: CteBatchUnitOfWorkPort) => {
    const batch = await getBatch(transaction, input)
    assertTransition(getStatus(batch), nextStatus)

    return updateStatus(transaction, {
      batch,
      batchId: input.batchId,
      companyId: input.context.companyId,
      nextStatus,
      userId: input.context.userId,
    })
  }

  return unitOfWork.execute?.(operation) ?? operation(unitOfWork)
}

/** A nota volta à seleção porque o vínculo em cte_batch_item_documents deixa de existir. */
async function removeBatchItem(
  unitOfWork: CteBatchUnitOfWorkPort,
  input: RemoveCteBatchItemInput,
): Promise<Record<string, unknown>> {
  const operation = async (transaction: CteBatchUnitOfWorkPort) => {
    const batch = await getBatch(transaction, input)
    if (getStatus(batch) !== DRAFT_STATUS) throw createInvalidStateError()

    const lookup = {
      batchId: input.batchId,
      companyId: input.context.companyId,
      itemId: input.itemId,
    }
    const item = await transaction.findBatchItem(lookup)
    if (item === null) throw createItemNotFoundError()

    await transaction.touchBatch({
      batchId: input.batchId,
      companyId: input.context.companyId,
      expectedStatus: DRAFT_STATUS,
    })
    const removal = await transaction.deleteBatchItem(lookup)
    await transaction.createBatchEvent({
      batchId: input.batchId,
      companyId: input.context.companyId,
      eventName: 'updated',
      payload: {
        documentIds: removal.documentIds,
        itemId: input.itemId,
        operation: ITEM_REMOVED_OPERATION,
        status: DRAFT_STATUS,
      },
      userId: input.context.userId,
    })

    return getBatch(transaction, input)
  }

  return unitOfWork.execute?.(operation) ?? operation(unitOfWork)
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
  await unitOfWork.createBatchEvent({
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

function resolveSubmissionReplay(
  replay: Record<string, unknown>,
  fingerprint: string,
): Record<string, unknown> {
  if (replay['requestFingerprint'] !== fingerprint) throw createIdempotencyConflictError()

  return getRequiredRecord(replay, 'batch')
}

function assertTransition(currentStatus: CteBatchStatus, nextStatus: CteBatchStatus): void {
  if (!ALLOWED_TRANSITIONS[currentStatus].includes(nextStatus)) throw createInvalidStateError()
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
