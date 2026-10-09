/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CapacityUnknownReason } from './capacity-unknown-reason.policy.js'
import type { TripOccupancySource } from './trip-occupancy.policy.js'
import type { TripCargoWeightSource } from './trip-cargo-weight.policy.js'

/**
 * Spec 259 RF1: a ocupação na linha de `/trips` — o recorte do que o painel de carga do detalhe
 * mostra. `weight` é a razão do teto de carga; `volume`, a da capacidade em m³. Cada lado é `null`
 * quando a conta não existe (sem peso nas notas, sem capacidade), e a razão **nunca** vira 0 nem 100
 * por ausência: quem lê precisa da marca de origem e do que falta (`documentsWithout*`).
 */
export type TripListOccupancy = {
  readonly capacityUnknownReason: CapacityUnknownReason | null
  readonly volume: {
    readonly documentsWithoutVolume: number
    readonly occupancyRatio: string
    readonly source: TripOccupancySource
  } | null
  readonly weight: {
    readonly documentsWithoutWeight: number
    /** `null` sem teto cadastrado na ficha do veículo — a tela diz "sem teto", não 0%. */
    readonly payloadRatio: string | null
    readonly source: TripCargoWeightSource
  } | null
}

export type BuildTripListOccupancyParams = {
  readonly capacityUnknownReason: CapacityUnknownReason | null
  /** O peso com o teto já aplicado (`withPayloadCeiling`), como o detalhe o serve. */
  readonly cargoWeight: {
    readonly documentsWithoutWeight: number
    readonly payloadRatio: string | null
    readonly source: TripCargoWeightSource
  } | null
  readonly volume: {
    readonly documentsWithoutVolume: number
    readonly occupancyRatio: string
    readonly source: TripOccupancySource
  } | null
}

export function buildTripListOccupancy(params: BuildTripListOccupancyParams): TripListOccupancy {
  return {
    capacityUnknownReason: params.capacityUnknownReason,
    volume:
      params.volume === null
        ? null
        : {
            documentsWithoutVolume: params.volume.documentsWithoutVolume,
            occupancyRatio: params.volume.occupancyRatio,
            source: params.volume.source,
          },
    weight:
      params.cargoWeight === null
        ? null
        : {
            documentsWithoutWeight: params.cargoWeight.documentsWithoutWeight,
            payloadRatio: params.cargoWeight.payloadRatio,
            source: params.cargoWeight.source,
          },
  }
}
