/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TRACTOR_UNIT_VEHICLE_TYPE } from '../../shared/vehicle-type.constant.js'

export type CapacityUnknownReason = 'bodyTypeMissing' | 'referenceMissing' | 'trailerMissing'

export type CapacityUnknownReasonCandidate = {
  readonly bodyType: string
  readonly vehicleType: string
}

export type ResolveCapacityUnknownReasonParams = {
  readonly capacityM3: string | null
  readonly traction: CapacityUnknownReasonCandidate
  readonly trailer: CapacityUnknownReasonCandidate | null
}

/**
 * Spec 147 D2/D3, RF4: a ocupação não pode ficar muda quando não sabe a capacidade — cada ausência
 * tem um motivo, e o motivo decide o link do painel.
 *
 * O carregador é o mesmo que `resolveVolumeReferenceKey` (`fleet/domain/vehicle-capacity.policy.ts`)
 * escolhe: a carreta quando existe, senão o próprio veículo de tração. `'00'` só é legítimo no
 * cavalo (`tractor_unit`) — em qualquer outro veículo, inclusive uma carreta cadastrada antes do
 * RF1, ele significa "carroceria não informada".
 *
 * Hoje a viagem não tem carreta (Fase 4), e por isso `trailer` é sempre `null` em produção — o
 * parâmetro já existe para quando o vínculo cavalo↔carreta entrar.
 */
export function resolveCapacityUnknownReason(
  params: ResolveCapacityUnknownReasonParams,
): CapacityUnknownReason | null {
  if (params.capacityM3 !== null) return null

  const carrier = params.trailer ?? params.traction
  if (carrier.bodyType === '00' && carrier.vehicleType !== TRACTOR_UNIT_VEHICLE_TYPE) {
    return 'bodyTypeMissing'
  }

  if (params.traction.vehicleType === TRACTOR_UNIT_VEHICLE_TYPE && params.trailer === null) {
    return 'trailerMissing'
  }

  return 'referenceMissing'
}
