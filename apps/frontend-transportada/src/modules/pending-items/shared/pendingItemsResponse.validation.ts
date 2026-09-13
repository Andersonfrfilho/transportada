/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PendingItem, PendingItemKind, PendingItemPage } from './pendingItemsClient.service'

const PENDING_ITEM_KINDS: readonly PendingItemKind[] = ['vehicleBodyTypeMissing']

function validationError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function createPendingItemPageAdapter(): {
  pageFromApi: (input: unknown) => PendingItemPage
} {
  return {
    pageFromApi(input) {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) {
        throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
      }
      const nextCursor = input.page.nextCursor
      if (nextCursor !== null && !isString(nextCursor)) {
        throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
      }
      return { items: input.data.map(mapPendingItem), nextCursor }
    },
  }
}

function mapPendingItem(input: unknown): PendingItem {
  if (!isRecord(input)) throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  if (
    Object.keys(input).some((key) => !['entityId', 'entityType', 'kind', 'label'].includes(key)) ||
    !isString(input.entityId) ||
    input.entityType !== 'vehicle' ||
    !PENDING_ITEM_KINDS.includes(input.kind as PendingItemKind) ||
    !isString(input.label)
  ) {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  return {
    entityId: input.entityId,
    entityType: 'vehicle',
    kind: input.kind as PendingItemKind,
    label: input.label,
  }
}
