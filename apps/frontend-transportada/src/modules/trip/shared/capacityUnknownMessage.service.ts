/* Copyright (c) 2026 Ada Technology. MIT License. */
import { buildFleetVehicleRoute } from '@/modules/fleet/shared/fleetRoute.service'

import type { CapacityUnknownReason } from './trip.types'

export type CapacityUnknownMessage = Readonly<{
  linkHref: string | null
  linkLabelKey: string | null
  textKey: string
}>

/**
 * Spec 147 D2/RF4: o motivo decide o texto e o destino do link — nunca "capacidade desconhecida"
 * sozinho. `bodyTypeMissing` e `trailerMissing` levam à ficha do veículo **que a viagem já tem**:
 * hoje não há carreta na viagem (Fase 4), então a ficha é sempre a do veículo de tração — no caso
 * do cavalo sem carreta, é a ficha dele que existe para editar.
 *
 * `referenceMissing` não tem link: o catálogo é quem falta, e não há campo na ficha do veículo que
 * resolva isso.
 */
export function resolveCapacityUnknownMessage(input: {
  readonly reason: CapacityUnknownReason
  readonly vehicleId: string
}): CapacityUnknownMessage {
  switch (input.reason) {
    case 'bodyTypeMissing':
      return {
        linkHref: buildFleetVehicleRoute(input.vehicleId),
        linkLabelKey: 'cargoPlan.missingBedLink',
        textKey: 'occupancy.capacityUnknownBodyType',
      }
    case 'trailerMissing':
      return {
        linkHref: buildFleetVehicleRoute(input.vehicleId),
        linkLabelKey: 'cargoPlan.missingBedLink',
        textKey: 'occupancy.capacityUnknownTrailer',
      }
    case 'referenceMissing':
      return { linkHref: null, linkLabelKey: null, textKey: 'occupancy.capacityUnknownReference' }
  }
}
