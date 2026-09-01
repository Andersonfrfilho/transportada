/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'NFE_CARGO_WEIGHT'
const WEIGHT_SCALE = 4n
const WEIGHT_FACTOR = 10n ** WEIGHT_SCALE

export const CARGO_WEIGHT_SOURCE = {
  /** `quantidade de volumes × peso padrão da empresa` — a nota não trouxe massa. */
  estimated: 'estimated',
  /** O `pesoB` que o emitente declarou no bloco `<vol>`. */
  xml: 'xml',
} as const

export type CargoWeightSource = (typeof CARGO_WEIGHT_SOURCE)[keyof typeof CARGO_WEIGHT_SOURCE]

export type ResolveCargoWeightParams = {
  readonly defaultWeightPerVolume: string | null
  readonly volumeGrossWeight: string | null
  readonly volumeQuantity: string | null
}

export type ResolvedCargoWeight = {
  readonly grossWeight: string
  readonly source: CargoWeightSource
}

function toScaled(value: string | null): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: WEIGHT_SCALE, value })
}

/**
 * O peso que o CT-e declara em `infQ`, na ordem em que a spec 067 decidiu: o que o emitente
 * declarou vence sempre; a estimativa só entra na ausência dele; e ausência das duas é ausência,
 * não zero — é ela que mantém o bloqueio de pé para quem não configurou peso padrão.
 *
 * A estimativa é por volume, e não um peso fixo por nota, porque a quantidade de volumes é o único
 * sinal de tamanho que a nota sem massa ainda traz. Sem volume não há de onde estimar.
 */
export function resolveCargoWeight({
  defaultWeightPerVolume,
  volumeGrossWeight,
  volumeQuantity,
}: ResolveCargoWeightParams): ResolvedCargoWeight | null {
  const declared = toScaled(volumeGrossWeight)
  if (declared > 0n) {
    return {
      grossWeight: formatScaledDecimal(declared, WEIGHT_SCALE),
      source: CARGO_WEIGHT_SOURCE.xml,
    }
  }

  const perVolume = toScaled(defaultWeightPerVolume)
  const quantity = toScaled(volumeQuantity)
  if (perVolume <= 0n || quantity <= 0n) return null

  return {
    grossWeight: formatScaledDecimal(
      divideHalfUp(perVolume * quantity, WEIGHT_FACTOR),
      WEIGHT_SCALE,
    ),
    source: CARGO_WEIGHT_SOURCE.estimated,
  }
}
