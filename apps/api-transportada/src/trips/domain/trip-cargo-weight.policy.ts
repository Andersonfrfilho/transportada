/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O peso da carga da **viagem**, com a origem junto — a irmã de `trip-occupancy.policy.ts`, que faz
 * o mesmo para cubagem.
 *
 * ⚠️ Spec 093: **o denominador existe, e sempre existiu.** `fleet_vehicles.capacity_kg` é o `capKG`
 * que o MDF-e exige e está preenchida em 10 dos 12 veículos desta base; o que faltava era alguém
 * lê-la fora da emissão fiscal. O comentário antigo aqui afirmava que a ficha não guardava massa
 * nenhuma, e é essa premissa — não a coluna — que estava faltando.
 *
 * Ausência continua sendo `null`, nunca 100% nem zero, pela mesma razão da ocupação: veículo sem
 * teto conhecido com carga dentro é o caso em que um número inventado faz alguém parar de carregar,
 * ou continuar.
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
  /**
   * O teto da ficha (`fleet_vehicles.capacity_kg`). ⚠️ **Zero é ausência**, como em toda medida da
   * ficha — não um veículo que não carrega nada.
   */
  readonly maxPayloadKg?: string | null
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
  /** O teto lido da ficha, ou `null` quando ninguém o cadastrou. */
  readonly maxPayloadKg: string | null
  /**
   * Quanto do teto a carga ocupa. `null` sem teto — e **sem aparar o estouro**: acima de 1 é o que
   * o conferente precisa ver, e um número aparado em 100% esconderia justamente o caso grave.
   */
  readonly payloadRatio: string | null
  readonly source: TripCargoWeightSource
}

/**
 * Uma nota estimada torna **o total** estimado, pela mesma razão do volume: quem carrega decide
 * pelo pior caso, e a marca é o que separa "cabe" de "deve caber".
 */
export function resolveTripCargoWeight({
  documents,
  maxPayloadKg = null,
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
    ...resolvePayloadCeiling({ maxPayloadKg, totalScaled: total }),
  }
}

/**
 * O teto aplicado a uma view **já montada** — é por onde a viagem e a prévia o acrescentam, porque
 * o peso e o veículo são lidos em paralelo e encadeá-los serializaria duas consultas por nada.
 *
 * ⚠️ A conta vive num lugar só (`resolvePayloadCeiling`): dois caminhos para o mesmo percentual é
 * como uma tela passa a discordar da outra sobre o mesmo caminhão.
 */
export function withPayloadCeiling(
  input: Readonly<{
    maxPayloadKg: string | null
    view: null | ResolvedTripCargoWeight
  }>,
): null | ResolvedTripCargoWeight {
  if (input.view === null) return null

  return {
    ...input.view,
    ...resolvePayloadCeiling({
      maxPayloadKg: input.maxPayloadKg,
      totalScaled: parseScaledDecimal({
        errorCodePrefix: ERROR_CODE_PREFIX,
        scale: WEIGHT_SCALE,
        value: input.view.grossWeightKilograms,
      }),
    }),
  }
}

function resolvePayloadCeiling(
  input: Readonly<{ maxPayloadKg: string | null; totalScaled: bigint }>,
): Readonly<{ maxPayloadKg: string | null; payloadRatio: string | null }> {
  const ceiling = parseCeiling(input.maxPayloadKg)
  if (ceiling === null) return { maxPayloadKg: null, payloadRatio: null }

  return {
    maxPayloadKg: formatScaledDecimal(ceiling, WEIGHT_SCALE),
    /** Sem aparar: acima de 1 é o que o conferente precisa ver. */
    payloadRatio: formatScaledDecimal(
      (input.totalScaled * 10n ** WEIGHT_SCALE) / ceiling,
      WEIGHT_SCALE,
    ),
  }
}

/** Zero e ausência dizem a mesma coisa: ninguém cadastrou o teto. */
function parseCeiling(value: string | null): bigint | null {
  if (value === null) return null
  const parsed = parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: WEIGHT_SCALE,
    value,
  })
  return parsed === 0n ? null : parsed
}
