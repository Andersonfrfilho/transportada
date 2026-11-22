/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  AddressSuggestionDetails,
  CanhotoOtherDocumentDetails,
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

function toNullableString(value: unknown): null | string {
  if (value === null || value === undefined) return null
  if (!isString(value)) throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  return value
}

function toNullableBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined) return null
  if (value === 'true' || value === true) return true
  if (value === 'false' || value === false) return false
  throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
}

function mapCanhotoOtherDocumentDetails(input: unknown): CanhotoOtherDocumentDetails {
  if (
    !isRecord(input) ||
    !isString(input.tripId) ||
    !isString(input.documentId) ||
    (input.kind !== 'other_document' && input.kind !== 'other_series') ||
    !isString(input.readNumber)
  ) {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  const targetDocumentId = toNullableString(input.targetDocumentId)
  return {
    documentId: input.documentId,
    kind: input.kind,
    /** Sem destino não há o que aplicar, qualquer que seja o `movable` que a API mandou. */
    movable: input.movable === 'true' && targetDocumentId !== null,
    readNumber: input.readNumber,
    readSeries: toNullableString(input.readSeries),
    targetCanhotoApproved: toNullableBoolean(input.targetCanhotoApproved),
    targetDocumentId,
    targetNumber: toNullableString(input.targetNumber),
    targetSameTrip: toNullableBoolean(input.targetSameTrip),
    targetSeries: toNullableString(input.targetSeries),
    tripId: input.tripId,
  }
}

function mapCanhotoOtherDocument(input: Record<string, unknown>): PendingItem {
  if (!isString(input.entityId) || !isString(input.label)) {
    throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  }
  return {
    details: mapCanhotoOtherDocumentDetails(input.details),
    entityId: input.entityId,
    entityType: 'canhotoProof',
    kind: 'canhotoOtherDocument',
    label: input.label,
  }
}

function mapPendingItem(input: unknown): PendingItem {
  if (!isRecord(input)) throw validationError('PENDING_ITEMS_INVALID_RESPONSE')
  if (input.kind === 'addressSuggestedByDriver' && input.entityType === 'addressSuggestion') {
    return mapAddressSuggestion(input)
  }
  if (input.kind === 'canhotoOtherDocument' && input.entityType === 'canhotoProof') {
    return mapCanhotoOtherDocument(input)
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
