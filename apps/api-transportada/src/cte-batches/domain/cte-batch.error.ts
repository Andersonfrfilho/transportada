/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import { CTE_BATCH_BLOCK_REASON } from './cte-batch-eligibility.policy.js'

const ALREADY_LINKED_REASONS: readonly string[] = [
  CTE_BATCH_BLOCK_REASON.alreadyLinked,
  CTE_BATCH_BLOCK_REASON.duplicated,
]

const PROFILE_REASON_PREFIX = 'CTE_PROFILE_'

export function createDocumentAlreadyLinkedError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
    message: 'NF-e is already linked to an active CT-e',
    status: 409,
  })
}

export function createDocumentLinkedToNfseError(): ApiError {
  return new ApiError({
    code: CTE_BATCH_BLOCK_REASON.linkedToNfse,
    message: 'NF-e is already linked to a municipal service invoice',
    status: 409,
  })
}

export function createBatchNameTakenError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_NAME_TAKEN',
    message: 'Another CT-e batch already uses this name',
    status: 409,
  })
}

export function createDocumentNotEligibleError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_DOCUMENT_NOT_ELIGIBLE',
    message: 'NF-e is not eligible for CT-e batch',
    status: 409,
  })
}

export function createFreightRuleVersionMissingError(): ApiError {
  return new ApiError({
    code: 'CTE_PROFILE_FREIGHT_RULE_VERSION_MISSING',
    message: 'CT-e emission profile has no published freight rule version',
    status: 409,
  })
}

export function createIdempotencyConflictError(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

export function createInvalidStateError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_INVALID_STATE',
    message: 'CT-e batch state transition is not allowed',
    status: 409,
  })
}

export function createNotFoundError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_NOT_FOUND',
    message: 'CT-e batch was not found',
    status: 404,
  })
}

export function createItemNotFoundError(): ApiError {
  return new ApiError({
    code: 'CTE_BATCH_ITEM_NOT_FOUND',
    message: 'CT-e batch item was not found',
    status: 404,
  })
}

/** Creation is all-or-nothing, so a preview block becomes the equivalent hard failure. */
export function createBlockError(reason: string): ApiError {
  if (ALREADY_LINKED_REASONS.includes(reason)) return createDocumentAlreadyLinkedError()
  if (reason === CTE_BATCH_BLOCK_REASON.linkedToNfse) return createDocumentLinkedToNfseError()
  if (reason.startsWith(PROFILE_REASON_PREFIX)) {
    return new ApiError({
      code: reason,
      message: 'CT-e emission profile could not be applied to the NF-e',
      status: 409,
    })
  }

  return createDocumentNotEligibleError()
}
