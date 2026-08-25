/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import type { StopAddressComponents } from '../domain/stop-address-key.js'
import { checkTripAcceptsLinkage } from '../domain/trip-state.policy.js'
import { TripDocumentNotFoundError, TripStateTransitionNotAllowedError } from '../domain/trip.error.js'

export type DeliveryAddressOverrideRecord = {
  readonly actorUserId: string
  readonly createdAt: string
  readonly id: string
  readonly newAddress: StopAddressComponents
  readonly newLabel: string
  readonly previousAddress: StopAddressComponents
  readonly previousLabel: string
  readonly reason: string
  readonly requestedBy: string
  readonly tripDocumentId: string
}

export type OverrideDeliveryAddressPreconditions = {
  readonly tripId: string
  readonly tripStatus: TripStatus
}

export type OverrideDeliveryAddressPort = {
  applyOverride(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly newAddress: StopAddressComponents
    readonly newLabel: string
    readonly reason: string
    readonly requestedBy: string
    readonly tripDocumentId: string
    readonly tripId: string
  }): Promise<DeliveryAddressOverrideRecord>
  readPreconditions(input: {
    readonly companyId: string
    readonly tripDocumentId: string
  }): Promise<OverrideDeliveryAddressPreconditions | null>
}

export type OverrideDeliveryAddressInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly newAddress: StopAddressComponents
  readonly newLabel: string
  readonly reason: string
  readonly repository: OverrideDeliveryAddressPort
  readonly requestedBy: string
  readonly tripDocumentId: string
}

/**
 * ADR-0043 §3 (D9): sobrescrever o endereço de entrega é ação, não edição em linha — nunca
 * `UPDATE` direto. Mesma porta de não-retorno de vincular/desvincular nota e reordenar parada
 * (T013/T014b): a carga já está na rua a partir de `dispatched`, e o roteiro congelado no
 * `trip_stop_snapshot` é o que vale dali em diante.
 */
export async function overrideDeliveryAddress(
  input: OverrideDeliveryAddressInput,
): Promise<DeliveryAddressOverrideRecord> {
  const { actorUserId, companyId, newAddress, newLabel, reason, repository, requestedBy, tripDocumentId } =
    input
  const preconditions = await repository.readPreconditions({ companyId, tripDocumentId })
  if (preconditions === null) throw new TripDocumentNotFoundError()

  const blockReason = checkTripAcceptsLinkage(preconditions.tripStatus)
  if (blockReason !== null) throw new TripStateTransitionNotAllowedError(blockReason)

  return repository.applyOverride({
    actorUserId,
    companyId,
    newAddress,
    newLabel,
    reason,
    requestedBy,
    tripDocumentId,
    tripId: preconditions.tripId,
  })
}
