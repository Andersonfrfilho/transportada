/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'NFE_CARGO_VOLUME'
const VOLUME_SCALE = 6n
const VOLUME_FACTOR = 10n ** VOLUME_SCALE

/**
 * ⚠️ **Uma origem só, e não é descuido.** O peso tem `xml` porque o emitente declara `pesoB` no
 * bloco `<vol>`. **A NF-e não tem campo de cubagem** — nem dimensão, nem metro cúbico —, então
 * `declarado` não é um estado alcançável, e pôr no tipo seria código morto que parece cobertura
 * (spec 075 D3). Quando existir declaração manual por nota, ela entra junto com o campo que a
 * produz.
 */
export const CARGO_VOLUME_SOURCE = {
  /** `quantidade de volumes × fator da espécie` — a nota não traz medida nenhuma. */
  estimated: 'estimated',
} as const

export type CargoVolumeSource = (typeof CARGO_VOLUME_SOURCE)[keyof typeof CARGO_VOLUME_SOURCE]

export type ResolveCargoVolumeParams = {
  readonly volumeFactor: string | null
  readonly volumeQuantity: string | null
}

export type ResolvedCargoVolume = {
  readonly source: CargoVolumeSource
  readonly volumeM3: string
}

function toScaled(value: string | null): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: VOLUME_SCALE, value })
}

/**
 * A cubagem que a ocupação da viagem usa, na ordem que a spec 075 decidiu: só há estimativa, e a
 * ausência dela é ausência — nunca zero. Zero declararia que a carga não ocupa espaço, e somaria
 * como se fosse medida (ADR-0052, mesma decisão para massa).
 *
 * A estimativa é **por volume** e não um valor fixo por nota, porque a quantidade de volumes é o
 * único sinal de tamanho que a nota traz. Sem volume não há de onde estimar.
 */
export function resolveCargoVolume({
  volumeFactor,
  volumeQuantity,
}: ResolveCargoVolumeParams): ResolvedCargoVolume | null {
  const factor = toScaled(volumeFactor)
  const quantity = toScaled(volumeQuantity)
  if (factor <= 0n || quantity <= 0n) return null

  return {
    source: CARGO_VOLUME_SOURCE.estimated,
    volumeM3: formatScaledDecimal(divideHalfUp(factor * quantity, VOLUME_FACTOR), VOLUME_SCALE),
  }
}
