/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteBatchCreate } from './cteBatchClient.service'

const DEFAULT_BATCH_NAME = 'Lote CT-e julho'

function draftError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function rejectExtraKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw draftError('CTE_BATCH_INVALID_DRAFT')
  }
}

export function createCteBatchDrafts() {
  return {
    createBatchDraft(input: Record<string, unknown>): CteBatchCreate {
      if (!isRecord(input)) throw draftError('CTE_BATCH_INVALID_DRAFT')
      rejectExtraKeys(input, ['documentIds', 'name'])
      if (
        !Array.isArray(input.documentIds) ||
        input.documentIds.length === 0 ||
        !input.documentIds.every((documentId) => typeof documentId === 'string')
      ) {
        throw draftError('CTE_BATCH_INVALID_DRAFT')
      }
      return {
        documentIds: input.documentIds,
        name: typeof input.name === 'string' ? input.name : DEFAULT_BATCH_NAME,
      }
    },
    createCancelDraft(): Record<string, never> {
      return {}
    },
    createSubmitDraft(): Record<string, never> {
      return {}
    },
  }
}
