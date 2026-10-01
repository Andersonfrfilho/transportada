/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { TRACTOR_UNIT_VEHICLE_TYPE, type VehicleType } from '../../shared/vehicle-type.constant.js'
import { checkTripAcceptsLinkage, type TripTransitionBlock } from './trip-state.policy.js'

export type TripTrailerAssignmentOutcome =
  | { readonly outcome: 'allowed' }
  | { readonly outcome: 'blocked'; readonly reason: TripTransitionBlock }
  | { readonly outcome: 'requiresTractor' }
  | { readonly outcome: 'unchanged' }

export type CheckTripAcceptsTrailerParams = {
  readonly currentTrailerVehicleId: string | null
  readonly nextTrailerVehicleId: string | null
  readonly tractionVehicleType: VehicleType | ''
  readonly tripStatus: TripStatus
}

/**
 * Feature 147 D3/T10: mesma ordem de `checkTripDocumentTransition` — o no-op vem primeiro, depois
 * o estado da viagem (reusa `checkTripAcceptsLinkage`, o mesmo portão de vincular/desvincular
 * nota), e só depois a regra específica. Quem aponta ser mesmo uma carreta ativa da empresa exige
 * consulta ao banco e é conferido fora daqui, pelo chamador.
 */
export function checkTripAcceptsTrailer(
  params: CheckTripAcceptsTrailerParams,
): TripTrailerAssignmentOutcome {
  if (params.nextTrailerVehicleId === params.currentTrailerVehicleId) {
    return { outcome: 'unchanged' }
  }

  const blockReason = checkTripAcceptsLinkage(params.tripStatus)
  if (blockReason !== null) return { outcome: 'blocked', reason: blockReason }

  if (
    params.nextTrailerVehicleId !== null &&
    params.tractionVehicleType !== TRACTOR_UNIT_VEHICLE_TYPE
  ) {
    return { outcome: 'requiresTractor' }
  }

  return { outcome: 'allowed' }
}
