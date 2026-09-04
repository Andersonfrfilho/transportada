/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'TRIP_CARGO_LAYOUT'
const VOLUME_SCALE = 6n
const SHARE_SCALE = 4n
const SHARE_FACTOR = 10n ** SHARE_SCALE

export type CargoLayoutStop = {
  readonly documentsWithoutVolume: number
  readonly label: string
  readonly sequence: number
  readonly volumeM3: string | null
}

export type CargoLayoutSlice = {
  readonly label: string
  /**
   * A ordem de **carregamento**, que é o inverso da de entrega: quem entrega por último viaja no
   * fundo, e quem entrega primeiro fica na porta. `1` é o fundo.
   */
  readonly loadOrder: number
  readonly sequence: number
  /** Fração da capacidade que esta parada ocupa. */
  readonly share: string
  readonly volumeM3: string
}

export type ResolvedCargoLayout = {
  /** Quanto passou da capacidade — representado **fora** do baú, nunca comprimido para caber. */
  readonly overflowM3: string
  readonly slices: readonly CargoLayoutSlice[]
  /** Paradas cujas notas não têm cubagem: ditas à parte, nunca desenhadas como fatia zero. */
  readonly stopsWithoutVolume: readonly { readonly documentCount: number; readonly label: string }[]
}

function toScaled(value: string | null): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: VOLUME_SCALE, value })
}

/**
 * Spec 076: a fatia do baú de cada parada.
 *
 * ⚠️ **É representação proporcional, não plano de estiva.** A NF-e não traz dimensão de volume — a
 * cubagem é estimada e é um total por nota, não a caixa. Não há como calcular onde cada caixa vai,
 * e um desenho que sugerisse posição estaria inventando algo que alguém seguiria ao carregar.
 *
 * A unidade é a **parada**, nunca a nota (D2): o motorista abre a porta uma vez por endereço, e
 * fatiar por nota produziria dezenas de faixas que ninguém lê.
 *
 * `null` quando a capacidade não é conhecida (D3): sem proporção, um retângulo genérico "só para
 * ilustrar" seria uma afirmação falsa sobre espaço.
 */
export function resolveCargoLayout(input: {
  readonly capacityM3: string | null
  readonly stops: readonly CargoLayoutStop[]
}): ResolvedCargoLayout | null {
  const capacity = toScaled(input.capacityM3)
  if (capacity <= 0n) return null

  const withVolume = input.stops.filter((stop) => stop.volumeM3 !== null)
  const ordered = [...withVolume].sort((first, second) => first.sequence - second.sequence)

  let loaded = 0n
  const slices = ordered.map((stop, index) => {
    const volume = toScaled(stop.volumeM3)
    loaded += volume
    const share = volume >= capacity ? SHARE_FACTOR : divideHalfUp(volume * SHARE_FACTOR, capacity)
    return {
      label: stop.label,
      /** O fundo é `1`, e ele pertence à **última** entrega. */
      loadOrder: ordered.length - index,
      sequence: stop.sequence,
      share: formatScaledDecimal(share, SHARE_SCALE),
      volumeM3: formatScaledDecimal(volume, VOLUME_SCALE),
    }
  })

  return {
    overflowM3: formatScaledDecimal(loaded > capacity ? loaded - capacity : 0n, VOLUME_SCALE),
    slices,
    stopsWithoutVolume: input.stops
      .filter((stop) => stop.volumeM3 === null)
      .map((stop) => ({ documentCount: stop.documentsWithoutVolume, label: stop.label })),
  }
}
