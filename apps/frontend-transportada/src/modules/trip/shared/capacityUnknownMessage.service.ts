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
 * sozinho. `bodyTypeMissing` leva à ficha de **quem carrega** — a carreta atrelada quando existe,
 * senão o cavalo — e `trailerMissing` leva à ficha do cavalo, que é quem falta atrelar uma. T18
 * (revisão): antes desta correção o link sempre apontava para `vehicleId` (o veículo da viagem),
 * e com carreta atrelada e carroceria dela sem cadastro, o link levava à ficha errada.
 *
 * `capacityUnknownVehicleId` é o veículo já resolvido pela API (`carrier` em `bodyTypeMissing`, o
 * próprio `vehicleId` nos demais motivos) — opcional porque a API pode subir antes do frontend;
 * ausente, cai de volta em `vehicleId`, o comportamento de antes desta correção.
 *
 * `referenceMissing` não tem link: o catálogo é quem falta, e não há campo na ficha do veículo que
 * resolva isso.
 */
export function resolveCapacityUnknownMessage(input: {
  readonly capacityUnknownVehicleId?: string | null
  readonly reason: CapacityUnknownReason
  readonly vehicleId: string
}): CapacityUnknownMessage {
  const linkVehicleId = input.capacityUnknownVehicleId ?? input.vehicleId
  switch (input.reason) {
    case 'bodyTypeMissing':
      return {
        linkHref: buildFleetVehicleRoute(linkVehicleId),
        linkLabelKey: 'cargoPlan.missingBedLink',
        textKey: 'occupancy.capacityUnknownBodyType',
      }
    case 'trailerMissing':
      return {
        linkHref: buildFleetVehicleRoute(linkVehicleId),
        linkLabelKey: 'cargoPlan.missingBedLink',
        textKey: 'occupancy.capacityUnknownTrailer',
      }
    case 'referenceMissing':
      return { linkHref: null, linkLabelKey: null, textKey: 'occupancy.capacityUnknownReference' }
  }
}
