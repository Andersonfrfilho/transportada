/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'TRIP_OCCUPANCY'
const VOLUME_SCALE = 6n
const RATIO_SCALE = 4n
const RATIO_FACTOR = 10n ** RATIO_SCALE

/**
 * ⚠️ Uma nota estimada torna **o total** estimado. A tela não pode imprimir número com cara de
 * medido só porque a maioria das parcelas era medida: quem carrega decide pelo pior caso, e a marca
 * de estimativa é o que separa "cabe" de "deve caber".
 */
export const TRIP_OCCUPANCY_SOURCE = {
  declared: 'declared',
  estimated: 'estimated',
} as const

export type TripOccupancySource = (typeof TRIP_OCCUPANCY_SOURCE)[keyof typeof TRIP_OCCUPANCY_SOURCE]

export type TripOccupancyDocument = {
  readonly source: string | null
  readonly volumeM3: string | null
}

export type ResolveTripOccupancyParams = {
  readonly capacityM3: string | null
  readonly documents: readonly TripOccupancyDocument[]
}

export type ResolvedTripOccupancy = {
  /** Notas que entraram na viagem sem cubagem — ditas à parte, nunca somadas como zero. */
  readonly documentsWithoutVolume: number
  readonly loadedM3: string
  readonly occupancyRatio: string
  readonly source: TripOccupancySource
}

function toScaled(value: string | null): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: VOLUME_SCALE, value })
}

/**
 * `null` quando a capacidade do veículo não é conhecida — **nunca 100%, nunca zero**. Veículo sem
 * capacidade com carga dentro é exatamente o caso em que um número inventado faria alguém parar de
 * carregar, ou continuar.
 *
 * Estouro acima de 100% sai como está: passar do limite é informação operacional, não erro a
 * esconder — e com estimativa, é o sinal de que o fator precisa de ajuste.
 */
export function resolveTripOccupancy({
  capacityM3,
  documents,
}: ResolveTripOccupancyParams): ResolvedTripOccupancy | null {
  const capacity = toScaled(capacityM3)
  if (capacity <= 0n) return null

  let loaded = 0n
  let documentsWithoutVolume = 0
  let estimated = false
  for (const document of documents) {
    if (document.volumeM3 === null) {
      documentsWithoutVolume += 1
      continue
    }
    loaded += toScaled(document.volumeM3)
    if (document.source === TRIP_OCCUPANCY_SOURCE.estimated) estimated = true
  }

  return {
    documentsWithoutVolume,
    loadedM3: formatScaledDecimal(loaded, VOLUME_SCALE),
    occupancyRatio: formatScaledDecimal(divideHalfUp(loaded * RATIO_FACTOR, capacity), RATIO_SCALE),
    source: estimated ? TRIP_OCCUPANCY_SOURCE.estimated : TRIP_OCCUPANCY_SOURCE.declared,
  }
}
