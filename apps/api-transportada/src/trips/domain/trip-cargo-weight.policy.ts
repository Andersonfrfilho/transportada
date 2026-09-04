/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O peso da carga da **viagem**, com a origem junto — a irmã de `trip-occupancy.policy.ts`, que faz
 * o mesmo para cubagem.
 *
 * ⚠️ Não há denominador. A ficha do veículo guarda dimensões e `capacity_m3`, mas **nenhuma
 * capacidade em massa**, então aqui não existe percentual: sai o total e a origem dele. Inventar um
 * teto para produzir porcentagem seria o defeito que a ocupação evita ao devolver `null` sem
 * capacidade conhecida.
 */
import { formatScaledDecimal, parseScaledDecimal } from '../../shared/decimal.service.js'
import { CARGO_WEIGHT_SOURCE } from '../../nfe-documents/domain/cargo-weight.policy.js'
import { TRIP_OCCUPANCY_SOURCE } from './trip-occupancy.policy.js'
import type { TripOccupancySource } from './trip-occupancy.policy.js'

const ERROR_CODE_PREFIX = 'TRIP_CARGO_WEIGHT'
const WEIGHT_SCALE = 4n

export type TripCargoWeightDocument = {
  readonly grossWeightKilograms: string | null
  readonly source: string | null
}

export type ResolveTripCargoWeightParams = {
  readonly documents: readonly TripCargoWeightDocument[]
}

export type ResolvedTripCargoWeight = {
  /** Notas sem peso — ditas à parte, nunca somadas como zero. */
  readonly documentsWithoutWeight: number
  readonly grossWeightKilograms: string
  readonly source: TripOccupancySource
}

/**
 * Uma nota estimada torna **o total** estimado, pela mesma razão do volume: quem carrega decide
 * pelo pior caso, e a marca é o que separa "cabe" de "deve caber".
 */
export function resolveTripCargoWeight({
  documents,
}: ResolveTripCargoWeightParams): null | ResolvedTripCargoWeight {
  let total = 0n
  let weighed = 0
  let documentsWithoutWeight = 0
  let estimated = false

  for (const document of documents) {
    if (document.grossWeightKilograms === null) {
      documentsWithoutWeight += 1
      continue
    }
    total += parseScaledDecimal({
      errorCodePrefix: ERROR_CODE_PREFIX,
      scale: WEIGHT_SCALE,
      value: document.grossWeightKilograms,
    })
    weighed += 1
    if (document.source === CARGO_WEIGHT_SOURCE.estimated) estimated = true
  }

  if (weighed === 0) return null

  return {
    documentsWithoutWeight,
    grossWeightKilograms: formatScaledDecimal(total, WEIGHT_SCALE),
    source: estimated ? TRIP_OCCUPANCY_SOURCE.estimated : TRIP_OCCUPANCY_SOURCE.declared,
  }
}
