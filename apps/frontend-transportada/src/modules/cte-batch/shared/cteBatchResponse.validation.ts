/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CteBatchEvent,
  CteBatchEventListPage,
  CteBatchListPage,
  CteBatchStatus,
  CteBatchSummary,
} from './cteBatchClient.service'

function validationError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isBatchStatus(value: unknown): value is CteBatchStatus {
  return (
    isString(value) &&
    ['cancelled', 'done', 'draft', 'error', 'in_flight', 'submitted'].includes(value)
  )
}

function isEventName(value: unknown): value is CteBatchEvent['eventName'] {
  return (
    isString(value) &&
    ['cancelled', 'created', 'done', 'error', 'in_flight', 'submitted', 'updated'].includes(value)
  )
}

function rejectExtraKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  code: string,
): void {
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw validationError(code)
  }
}

function readNextCursor(input: Record<string, unknown>, code: string): null | string {
  if (!isRecord(input.page)) throw validationError(code)
  rejectExtraKeys(input.page, ['nextCursor'], code)
  const nextCursor = input.page.nextCursor
  if (nextCursor !== null && !isString(nextCursor)) throw validationError(code)
  return nextCursor
}

export function createCteBatchResponseAdapters() {
  return {
    batchFromApi(input: unknown): CteBatchSummary {
      if (!isRecord(input)) throw validationError('CTE_BATCH_INVALID_RESPONSE')
      rejectExtraKeys(
        input,
        ['correlationId', 'createdAt', 'id', 'itemCount', 'name', 'status', 'updatedAt', 'version'],
        'CTE_BATCH_INVALID_RESPONSE',
      )
      if (
        !isString(input.correlationId) ||
        !isString(input.createdAt) ||
        !isString(input.id) ||
        typeof input.itemCount !== 'number' ||
        !Number.isInteger(input.itemCount) ||
        !isString(input.name) ||
        !isBatchStatus(input.status) ||
        !isString(input.updatedAt) ||
        !isString(input.version)
      ) {
        throw validationError('CTE_BATCH_INVALID_RESPONSE')
      }
      return {
        correlationId: input.correlationId,
        createdAt: input.createdAt,
        id: input.id,
        itemCount: input.itemCount,
        name: input.name,
        status: input.status,
        updatedAt: input.updatedAt,
        version: input.version,
      }
    },
    batchListFromApi(input: unknown): CteBatchListPage {
      if (!isRecord(input) || !Array.isArray(input.data)) {
        throw validationError('CTE_BATCH_INVALID_LIST_RESPONSE')
      }
      rejectExtraKeys(input, ['data', 'page'], 'CTE_BATCH_INVALID_LIST_RESPONSE')
      try {
        return {
          items: input.data.map((item) => this.batchFromApi(item)),
          nextCursor: readNextCursor(input, 'CTE_BATCH_INVALID_LIST_RESPONSE'),
        }
      } catch {
        throw validationError('CTE_BATCH_INVALID_LIST_RESPONSE')
      }
    },
    eventsFromApi(input: unknown): CteBatchEventListPage {
      if (!isRecord(input) || !Array.isArray(input.data)) {
        throw validationError('CTE_BATCH_INVALID_EVENTS_RESPONSE')
      }
      rejectExtraKeys(input, ['data', 'page'], 'CTE_BATCH_INVALID_EVENTS_RESPONSE')
      try {
        return {
          items: input.data.map((item) => this.eventFromApi(item)),
          nextCursor: readNextCursor(input, 'CTE_BATCH_INVALID_EVENTS_RESPONSE'),
        }
      } catch {
        throw validationError('CTE_BATCH_INVALID_EVENTS_RESPONSE')
      }
    },
    eventFromApi(input: unknown): CteBatchEvent {
      if (!isRecord(input)) throw validationError('CTE_BATCH_INVALID_EVENTS_RESPONSE')
      rejectExtraKeys(
        input,
        ['batchId', 'createdAt', 'eventName', 'id', 'payload'],
        'CTE_BATCH_INVALID_EVENTS_RESPONSE',
      )
      if (
        !isString(input.batchId) ||
        !isString(input.createdAt) ||
        !isEventName(input.eventName) ||
        !isString(input.id) ||
        !isRecord(input.payload)
      ) {
        throw validationError('CTE_BATCH_INVALID_EVENTS_RESPONSE')
      }
      return {
        batchId: input.batchId,
        createdAt: input.createdAt,
        eventName: input.eventName,
        id: input.id,
        payload: input.payload,
      }
    },
  }
}
