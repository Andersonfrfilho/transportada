/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AddressSuggestionDetails,
  GeoPoint,
  PendingItem,
  PendingItemPage,
} from './pendingItemsClient.service'

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

function toCoordinate(value: unknown): number {
  const coordinate = typeof value === 'number' ? value : Number(value)
  if (value === null || value === '' || !Number.isFinite(coordinate)) {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  return coordinate
}

function toOptionalPoint(latitude: unknown, longitude: unknown): GeoPoint | null {
  if (latitude === null || latitude === undefined) return null
  return { latitude: toCoordinate(latitude), longitude: toCoordinate(longitude) }
}

function mapAddressSuggestionDetails(input: unknown): AddressSuggestionDetails {
  if (!isRecord(input) || !isString(input.addressKey)) {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  const distance = input.distanceMeters
  if (distance !== null && distance !== undefined && typeof distance !== 'number') {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  const tripStopId = input.tripStopId
  if (tripStopId !== null && tripStopId !== undefined && !isString(tripStopId)) {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  return {
    addressKey: input.addressKey,
    current: toOptionalPoint(input.currentLatitude, input.currentLongitude),
    distanceMeters: distance ?? null,
    suggested: { latitude: toCoordinate(input.latitude), longitude: toCoordinate(input.longitude) },
    tripStopId: tripStopId ?? null,
  }
}

function mapAddressSuggestion(input: Record<string, unknown>): PendingItem {
  if (!isString(input.entityId) || !isString(input.label)) {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  return {
    details: mapAddressSuggestionDetails(input.details),
    entityId: input.entityId,
    entityType: 'addressSuggestion',
    kind: 'addressSuggestedByDriver',
    label: input.label,
  }
}

function mapPendingItem(input: unknown): PendingItem {
  if (!isRecord(input)) throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  if (input.kind === 'addressSuggestedByDriver' && input.entityType === 'addressSuggestion') {
    return mapAddressSuggestion(input)
  }
  if (
    Object.keys(input).some((key) => !['entityId', 'entityType', 'kind', 'label'].includes(key)) ||
    !isString(input.entityId) ||
    input.entityType !== 'vehicle' ||
    input.kind !== 'vehicleBodyTypeMissing' ||
    !isString(input.label)
  ) {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  return {
    entityId: input.entityId,
    entityType: 'vehicle',
    kind: 'vehicleBodyTypeMissing',
    label: input.label,
  }
}
