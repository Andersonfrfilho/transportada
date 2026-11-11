/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 321 T5 (D4, D4d, D6): a coleta de canhoto — o canhoto que o cliente reteve e outro motorista busca em
 * outra viagem. Contrato de `GET /trip-canhoto-pickups` (T3): chaves exatas, `status` do vocabulário da API.
 *
 * "Aberta" é uma definição só (D6): `pending` ou `scheduled`.
 */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { isNullableString, isOneOf, isRecord, isString } from './tripGuards.validation'

export const CANHOTO_PICKUP_STATUSES = ['pending', 'scheduled', 'collected', 'cancelled'] as const

export type CanhotoPickupStatus = (typeof CANHOTO_PICKUP_STATUSES)[number]

export const CANHOTO_PICKUP_OPEN_STATUSES = ['pending', 'scheduled'] as const

export const CANHOTO_PICKUP_VIEW_KEYS = [
  'createdAt',
  'documentNumber',
  'id',
  'nfeDocumentId',
  'occurrenceId',
  'originStopLabel',
  'originTripDocumentId',
  'originTripId',
  'pickupStopId',
  'pickupTripId',
  'status',
] as const

export type CanhotoPickup = Readonly<{
  createdAt: string
  documentNumber: null | string
  id: string
  nfeDocumentId: null | string
  occurrenceId: string
  originStopLabel: null | string
  originTripDocumentId: string
  originTripId: string
  pickupStopId: null | string
  pickupTripId: null | string
  status: CanhotoPickupStatus
}>

export function isCanhotoPickup(value: unknown): value is CanhotoPickup {
  return (
    isRecord(value) &&
    hasExactKeys(value, CANHOTO_PICKUP_VIEW_KEYS) &&
    isString(value.createdAt) &&
    isNullableString(value.documentNumber) &&
    isString(value.id) &&
    isNullableString(value.nfeDocumentId) &&
    isString(value.occurrenceId) &&
    isNullableString(value.originStopLabel) &&
    isString(value.originTripDocumentId) &&
    isString(value.originTripId) &&
    isNullableString(value.pickupStopId) &&
    isNullableString(value.pickupTripId) &&
    isOneOf(value.status, CANHOTO_PICKUP_STATUSES)
  )
}

export function isCanhotoPickupOpen(pickup: Pick<CanhotoPickup, 'status'>): boolean {
  return pickup.status === 'pending' || pickup.status === 'scheduled'
}

/** As coletas encaixadas nesta viagem e as que o escritório ainda pode encaixar nela (nunca a viagem de origem). */
export function splitCanhotoPickupsForTrip(
  input: Readonly<{ pickups: readonly CanhotoPickup[]; tripId: string }>,
): Readonly<{ available: readonly CanhotoPickup[]; scheduled: readonly CanhotoPickup[] }> {
  return {
    available: input.pickups.filter(
      (pickup) =>
        pickup.originTripId !== input.tripId &&
        (pickup.status === 'pending' ||
          (pickup.status === 'scheduled' && pickup.pickupTripId !== input.tripId)),
    ),
    scheduled: input.pickups.filter(
      (pickup) => pickup.status === 'scheduled' && pickup.pickupTripId === input.tripId,
    ),
  }
}

/**
 * Spec 321 D4d (molde do `proofPending`, spec 223): a nota de origem "canhoto retido". O campo é **opcional** —
 * API anterior não o manda, e ausente é "esta API não conta", nunca "sem retenção". Só `true` marca.
 */
export type CanhotoRetainedMarkerSource = Readonly<{ canhotoRetained?: boolean }>

export function hasCanhotoRetainedMarker(document: CanhotoRetainedMarkerSource): boolean {
  return document.canhotoRetained === true
}
