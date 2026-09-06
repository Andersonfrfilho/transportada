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

const ERROR_CODE_PREFIX = 'TRIP_CARGO_WEIGHT'
const WEIGHT_SCALE = 4n

export type TripCargoWeightDocument = {
  readonly grossWeightKilograms: string | null
  readonly source: string | null
}

export type ResolveTripCargoWeightParams = {
  readonly documents: readonly TripCargoWeightDocument[]
}

/**
 * ⚠️ Origem **própria**, não a do volume. Ela emprestava `TripOccupancySource`, e quando a spec 085
 * deu ao volume as origens `measured` e `partial` — que vêm da caixa medida e **não existem para
 * massa**, porque a NF-e declara `pesoB` e nunca dimensão — o empréstimo passou a prometer ao peso
 * dois estados inalcançáveis. Duas grandezas, dois vocabulários.
 */
export type TripCargoWeightSource = 'declared' | 'estimated'

export type ResolvedTripCargoWeight = {
  /** Notas sem peso — ditas à parte, nunca somadas como zero. */
  readonly documentsWithoutWeight: number
  readonly grossWeightKilograms: string
  readonly source: TripCargoWeightSource
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
    source: estimated ? 'estimated' : 'declared',
  }
}
